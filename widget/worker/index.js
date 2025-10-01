import widgetCode from './widget.txt';

const ACCOUNT_ID = '9ca4115b4354987fcb09f8ca5fb970ab';
const RAG_SLUG = 'kunstpakket-ai-search';
const API_TOKEN = 'QTYnM-wsXJni_9FARwUFa7ct7O96Kd1bE8hRA3an';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (pathname === '/widget.js') {
      return new Response(widgetCode, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          ...CORS_HEADERS
        }
      });
    }

    if (pathname === '/search' && request.method === 'POST') {
      return handleSearch(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },

  async queue() {}
};

async function handleSearch(request, env) {
  try {
    const { query } = await request.json();
    if (!query?.trim()) {
      return json({ error: 'Query required' }, 400);
    }
    
    const aiSearchRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/autorag/rags/${RAG_SLUG}/ai-search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_TOKEN}`
        },
        body: JSON.stringify({ query })
      }
    );
    
    const data = await aiSearchRes.json();
    if (!aiSearchRes.ok) {
      console.error('AI Search error:', data);
      return json({ error: 'Search failed', details: data }, aiSearchRes.status);
    }
    
    const answer = data.result?.response || '';
    const hits = data.result?.data || [];
    const ids = selectIdsFromAnswer(answer);

    if (!ids.length) {
      return json({ answer, products: [] });
    }

    const products = await hydrateProducts(ids, hits, env.BUCKET);

    return json({ answer, products });
  } catch (err) {
    console.error('Search error:', err);
    return json({ error: 'Internal error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

function extractId(item) {
  const filename = item.filename || item.attributes?.filename;
  if (filename?.endsWith('.json')) return filename.slice(0, -5);

  const textEntry = item.content?.find((part) => part.type === 'text')?.text;
  if (!textEntry) return null;

  try {
    const parsed = JSON.parse(textEntry);
    return parsed.id || parsed.metadata?.id || null;
  } catch (err) {
    console.error('Failed to parse id from hit', err);
    return null;
  }
}

async function hydrateProducts(ids, hits, bucket) {
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const obj = await bucket.get(`${id}.json`);
        if (!obj) return null;

        const data = await obj.json();
        const meta = data.metadata || {};

        return mapMetaToProduct(data.id || id, meta);
      } catch (err) {
        console.error(`Failed to fetch ${id}:`, err);
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

function mapMetaToProduct(id, meta) {
  return {
    id,
    title: meta.fulltitle || meta.title || '',
    price: meta.price ?? null,
    originalPrice: meta.originalPrice ?? null,
    hasDiscount: Boolean(meta.hasDiscount && meta.originalPrice),
    discountPercent: meta.discountPercent ?? null,
    image: meta.imageUrl || '',
    url: meta.url || ''
  };
}

function selectIdsFromAnswer(answer) {
  if (!answer) return [];

  const match = answer.match(/\[\[IDs:\s*([^\]]+)\]\]/i);
  if (!match) return [];

  return match[1]
    .split(',')
    .map(id => id.trim().replace(/['"`]/g, ''))
    .filter(Boolean);
}

function getUrlFromHit(item) {
  const filename = item.filename || item.attributes?.filename;
  if (filename?.startsWith('http')) return filename; // unlikely but guard

  const textEntry = item.content?.find((part) => part.type === 'text')?.text;
  if (!textEntry) return null;

  try {
    const parsed = JSON.parse(textEntry);
    return parsed.metadata?.url || null;
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  if (!url) return '';
  const cleaned = url
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/[)\].,;:!?]+$/g, '');

  try {
    const u = new URL(cleaned);
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch {
    return cleaned;
  }
}