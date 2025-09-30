// Cloudflare Worker: AI Search Widget
import widgetCode from './widget.txt';

const ACCOUNT_ID = '9ca4115b4354987fcb09f8ca5fb970ab';
const RAG_SLUG = 'kunstpakket-ai-search';
const API_TOKEN = 'QTYnM-wsXJni_9FARwUFa7ct7O96Kd1bE8hRA3an';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }
    
    // Serve widget.js
    if (url.pathname === '/widget.js') {
      return serveWidget();
    }
    
    // Proxy search requests
    if (url.pathname === '/search' && request.method === 'POST') {
      return handleSearch(request, env);
    }
    
    return new Response('Not Found', { status: 404 });
  },
  
  // Dummy queue handler (unused, for deployment compatibility)
  async queue() {}
};

async function serveWidget() {
  return new Response(widgetCode, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function handleSearch(request, env) {
  try {
    const { query } = await request.json();
    
    if (!query?.trim()) {
      return jsonResponse({ error: 'Query required' }, 400);
    }
    
    // Call Cloudflare AI Search
    const response = await fetch(
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
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('AI Search error:', data);
      return jsonResponse({ error: 'Search failed', details: data }, response.status);
    }
    
    // Get product IDs from filenames
    const productIds = (data.result?.data || [])
      .map(item => item.filename?.replace('.md', ''))
      .filter(Boolean)
      .slice(0, 8);
    
    // Fetch products from R2
    const products = await fetchProductsFromR2(productIds, env.BUCKET);
    
    return jsonResponse({
      answer: data.result?.response || '',
      products
    });
    
  } catch (err) {
    console.error('Search handler error:', err);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
}

async function fetchProductsFromR2(productIds, bucket) {
  // Fetch all products in parallel from R2
  const promises = productIds.map(async (id) => {
    try {
      const obj = await bucket.get(`${id}.md`);
      if (!obj) return null;
      
      const text = await obj.text();
      const match = text.match(/^---\n([\s\S]*?)\n---/);
      if (!match) return null;
      
      const yaml = match[1];
      
      // Simple YAML parser
      const get = (key) => {
        const regex = new RegExp(`^${key}:\\s*(?:"([^"]+)"|'([^']+)'|(\\S+))`, 'm');
        const m = yaml.match(regex);
        return m ? (m[1] || m[2] || m[3]).trim() : '';
      };
      
      return {
        id: get('id'),
        title: get('fulltitle') || get('title'),
        price: get('price'),
        image: get('imageUrl'),
        url: get('url')
      };
    } catch (err) {
      console.error(`Failed to fetch product ${id}:`, err);
      return null;
    }
  });
  
  const results = await Promise.all(promises);
  return results.filter(p => p && p.id);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
