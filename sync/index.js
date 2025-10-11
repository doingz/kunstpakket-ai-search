/**
 * Cloudflare Worker - Lightspeed → R2 synchronisatie (pure data)
 */

// Helper function for OpenAI Responses API calls
async function callOpenAIResponses(env, { model = 'gpt-4o-mini', instructions, input, tools, tool_choice, temperature, max_tokens }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      tools,
      tool_choice,
      temperature,
      max_tokens
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  return response.json();
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncProducts(env, crypto.randomUUID()));
  },

  async fetch(request, env, ctx) {
    const { pathname, searchParams } = new URL(request.url);
    const { method } = request;

    if (pathname === '/sync' && method === 'POST') {
      const runId = crypto.randomUUID();
      const wait = searchParams.get('wait') === '1';

      if (!wait && ctx?.waitUntil) {
        ctx.waitUntil(syncProducts(env, runId));
        return jsonResponse({ message: 'sync started', runId });
      }

      await syncProducts(env, runId);
      return jsonResponse({ message: 'sync completed', runId });
    }

    if (pathname === '/sync/clear' && method === 'POST') {
      const token = searchParams.get('token') || request.headers.get('x-sync-token');
      if (env.SYNC_CLEAR_TOKEN && token !== env.SYNC_CLEAR_TOKEN) {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      return jsonResponse({ removed: await clearBucket(env) });
    }

    if (pathname === '/sync/r2-count' && method === 'GET') {
      try {
        return jsonResponse(await countR2Files(env));
      } catch (error) {
        return jsonResponse({ error: error.message }, 500);
      }
    }

    if (pathname === '/sync/preview' && method === 'GET') {
      const id = searchParams.get('id');
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const obj = await env.KUNSTPAKKET_PRODUCTS_BUCKET.get(`${id}.json`);
      if (!obj) return jsonResponse({ error: 'not found' }, 404);
      return jsonResponse(await obj.json());
    }

    if (pathname === '/sync/embeddings' && method === 'POST') {
      const offset = Number(searchParams.get('offset')) || 0;
      const limit = Number(searchParams.get('limit')) || 100;
      const wait = searchParams.get('wait') === '1';
      
      const task = async () => {
        try {
          // Load products from D1 in chunks
          const result = await env.DB.prepare(
            'SELECT * FROM products ORDER BY id LIMIT ? OFFSET ?'
          ).bind(limit, offset).all();
          
          const products = result.results || [];
          if (!products.length) {
            return { offset, count: 0, done: true };
          }
          
          // Convert to records format (include AI enrichment data)
          const records = products.map(p => ({
            id: p.id,
            metadata: {
              title: p.title,
              fulltitle: p.fulltitle,
              description: p.description,
              content: p.content,
              type: p.type,
              price: p.price,
              originalPrice: p.originalPrice,
              hasDiscount: Boolean(p.hasDiscount),
              discountPercent: p.discountPercent,
              stock: p.stock,
              salesCount: p.salesCount,
              imageUrl: p.imageUrl,
              url: p.url,
              tags: p.tags ? JSON.parse(p.tags) : [],
              categories: p.categories ? JSON.parse(p.categories) : [],
              ai_tags: p.ai_tags ? JSON.parse(p.ai_tags) : [],
              ai_keywords: p.ai_keywords || null,
              ai_summary: p.ai_summary || null
            }
          }));
          
          const embedded = await saveEmbeddingsToVectorize(env, records);
          return { offset, count: embedded, done: products.length < limit };
        } catch (error) {
          console.error('Embedding chunk failed:', error);
          return { offset, count: 0, error: error.message };
        }
      };
      
      if (!wait && ctx?.waitUntil) {
        ctx.waitUntil(task());
        return jsonResponse({ message: 'embedding started', offset, limit });
      }
      
      return jsonResponse(await task());
    }

    if (pathname === '/sync/enrich' && method === 'POST') {
      const offset = Number(searchParams.get('offset')) || 0;
      const limit = Number(searchParams.get('limit')) || 20; // Smaller batches for AI
      const wait = searchParams.get('wait') === '1';
      
      const task = async () => {
        try {
          // Load products from D1 that haven't been enriched yet
          const result = await env.DB.prepare(
            'SELECT * FROM products WHERE ai_summary IS NULL ORDER BY id LIMIT ? OFFSET ?'
          ).bind(limit, offset).all();
          
          const products = result.results || [];
          if (!products.length) {
            return { offset, count: 0, done: true };
          }
          
          // Enrich each product with AI
          let enriched = 0;
          for (const p of products) {
            try {
              const aiData = await enrichProductWithAI({
                title: p.title,
                fulltitle: p.fulltitle,
                description: p.description,
                content: p.content,
                price: p.price,
                tags: p.tags ? JSON.parse(p.tags) : [],
                categories: p.categories ? JSON.parse(p.categories) : []
              }, env);
              
              // Update product with AI data
              await env.DB.prepare(`
                UPDATE products 
                SET ai_tags = ?, ai_keywords = ?, ai_summary = ?
                WHERE id = ?
              `).bind(
                JSON.stringify(aiData.ai_tags),
                aiData.ai_keywords,
                aiData.ai_summary,
                p.id
              ).run();
              
              enriched++;
              
              // Log progress every 5 products
              if (enriched % 5 === 0) {
                console.log(`Enriched ${enriched}/${products.length} products (offset ${offset})`);
              }
            } catch (error) {
              console.error(`Failed to enrich product ${p.id}:`, error.message);
            }
          }
          
          return { offset, count: enriched, total: products.length, done: products.length < limit };
        } catch (error) {
          console.error('Enrichment chunk failed:', error);
          return { offset, count: 0, error: error.message };
        }
      };
      
      if (!wait && ctx?.waitUntil) {
        ctx.waitUntil(task());
        return jsonResponse({ message: 'enrichment started', offset, limit });
      }
      
      return jsonResponse(await task());
    }

    return new Response('Not found', { status: 404 });
  },

  async queue() {}
};

async function syncProducts(env, runId) {
  try {
    console.log(`🚀 Sync started - ${runId}`);

    const [products, variants, tags, tagProducts, categories, categoryProducts] = await Promise.all([
      fetchLightspeedData(env, '/products.json', 'products'),
      fetchLightspeedData(env, '/variants.json', 'variants'),
      fetchLightspeedData(env, '/tags.json', 'tags'),
      fetchLightspeedData(env, '/tags/products.json', 'tagsProducts'),
      fetchLightspeedData(env, '/categories.json', 'categories'),
      fetchLightspeedData(env, '/categories/products.json', 'categoriesProducts')
    ]);

    const lookups = buildLookups({ variants, tags, tagProducts, categories, categoryProducts });
    const records = [];

    for (const product of products) {
      const record = buildProductRecord(product, lookups);
      if (record) records.push(record);
      if (records.length && records.length % 100 === 0) {
        console.log(`Progress: ${records.length}/${products.length}`);
      }
    }

    console.log(`📊 ${products.length} → ${records.length}`);

    const written = await saveProductsToD1(env, records, runId);
    console.log(`✅ Saved ${written} products to D1`);

    if (env.SKIP_CLEANUP !== '1') {
      const removed = await cleanupStaleFromD1(env, new Set(records.map((r) => r.id)));
      console.log(`🧹 Removed ${removed} stale products from D1`);
    }

    // Automatically start embeddings in batches (non-blocking)
    console.log(`🔄 Starting embeddings for ${written} products...`);
    const totalProducts = written;
    const batchSize = 100;
    const batches = Math.ceil(totalProducts / batchSize);
    
    for (let i = 0; i < batches; i++) {
      const offset = i * batchSize;
      // Fire and forget - embeddings run in background
      fetch(`https://kunstpakket-sync.lotapi.workers.dev/sync/embeddings?offset=${offset}&limit=${batchSize}`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer a2af3bc58e3825d9320ad4cd394a8f82ca5ca76439aa0c79c17b1e7f33ce8d75'
        }
      }).catch(err => console.error(`Embedding batch ${i} failed:`, err));
    }
    console.log(`✅ Triggered ${batches} embedding batches`);

    console.log(`📊 Completed - ${runId}`);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

async function fetchLightspeedData(env, endpoint, key) {
  await checkRateLimit(env);

  const limit = (key === 'products' && Number(env.DEBUG_LIMIT)) || 0;
  const items = [];
  let page = 1;

  while (true) {
    const data = await lightspeedFetch(env, `${endpoint}?page=${page}&limit=250`);
    const pageItems = data[key] || [];
    if (!pageItems.length) break;

    items.push(...pageItems);
    console.log(`📦 ${key} p${page}: ${pageItems.length} (total: ${items.length})`);

    if (pageItems.length < 250 || (limit && items.length >= limit)) break;
    page++;
  }

  return limit ? items.slice(0, limit) : items;
}

async function lightspeedFetch(env, endpoint, retries = 0) {
  const delay = Number(env.LS_DELAY_MS) || 600;
  await sleep(delay + Math.floor(Math.random() * delay / 2));

  const response = await withTimeout(
    fetch(`${env.LIGHTSPEED_BASE_URL}${endpoint}`, {
      headers: {
        Authorization: 'Basic ' + btoa(`${env.LIGHTSPEED_API_KEY}:${env.LIGHTSPEED_SECRET}`),
        Accept: 'application/json'
      }
    }),
    60000,
    endpoint
  );

  if (response.status === 429) {
    if (retries >= 5) throw new Error('Rate limit exceeded');
    const backoff = (Number(env.LS_BACKOFF_MS) || 60000) * Math.pow(2, retries);
    console.log(`⏳ Rate limited - retry in ${backoff}ms (${retries + 1}/5)`);
    await sleep(backoff);
    return lightspeedFetch(env, endpoint, retries + 1);
  }

  if (!response.ok) throw new Error(`${endpoint} failed: ${response.status}`);
  return response.json();
}

async function checkRateLimit(env) {
  try {
    const response = await withTimeout(
      fetch(`${env.LIGHTSPEED_BASE_URL}/account/ratelimit.json`, {
        headers: {
          Authorization: 'Basic ' + btoa(`${env.LIGHTSPEED_API_KEY}:${env.LIGHTSPEED_SECRET}`),
          Accept: 'application/json'
        }
      }),
      10000,
      'rate check'
    );

    if (response.ok) {
      const { accountRatelimit: limits } = await response.json();
      const remaining = limits.limit5Min.remaining;
      if (remaining < 50) console.log(`⚠️ Low rate limit: ${remaining}`);
    }
  } catch {
    console.log('⚠️ Rate limit check failed');
  }
}

function buildProductRecord(product, { variantsByProduct, productTags, productCats }) {
  const pid = Number(product.id);
  const variants = variantsByProduct.get(pid) || [];

  // Debug specific product
  if (pid === 121950347) {
    console.log('🔍 DEBUG Product 121950347:');
    console.log('  Title:', product.title);
    console.log('  Variants:', variants.length);
    console.log('  Stock tracking:', variants.map(v => ({ id: v.id, stockTracking: v.stockTracking, stockLevel: v.stockLevel })));
  }

  // Exclude special products (spoedbestelling, etc.)
  const title = (product.title || '').toLowerCase();
  const url = (product.url || '').toLowerCase();
  if (title.includes('spoedbestelling') || url.includes('spoedbestelling')) {
    return null;
  }

  const stock = extractStock(product, variants);
  const imageUrl = extractImageUrl(product);
  
  // Debug specific product
  if (pid === 121950347) {
    console.log('  Extracted stock:', stock);
    console.log('  Image URL:', imageUrl);
    console.log('  Will be filtered:', !imageUrl);
  }
  
  // Filter: Must have image. Stock defaults to 1000 if not available (for products without stock tracking)
  if (!imageUrl) return null;
  
  const finalStock = stock || 1000; // Default to 1000 if no stock info

  const tags = Array.from(new Set([...(productTags.get(pid) || [])].map(String))).filter(Boolean);
  const categories = productCats.get(pid) || [];
  const description = stripHtml(product.description || '');
  const content = stripHtml(product.content || '');

  const pricing = extractPricing(product, variants);
  const salesCount = extractSalesCount(product, variants);

  return {
    id: String(pid),
    metadata: {
      title: product.title || '',
      fulltitle: product.fulltitle || product.title || '',
      description,
      content,
      url: product.url ? `https://kunstpakket.nl/${product.url}.html` : '',
      imageUrl,
      price: pricing?.currentPrice ?? null,
      originalPrice: pricing?.originalPrice ?? null,
      hasDiscount: pricing?.hasDiscount ?? false,
      discountPercent: pricing?.discountPercent ?? null,
      stock: finalStock,
      salesCount,
      tags,
      categories,
      type: detectType(product, { tags, categories, description, content })
    }
  };
}

const ALLOWED_TYPES = new Set([
  'beeld','schilderij','mok','wandbord','vaas','schaal','kan','theepot','kandelaar',
  'theelicht','poster','masker','klok','wijnpakket','onderzetters','wijnstop',
  'kurkentrekker','sokkel','zandloper','schaakbord','geurdispenser','sfeerlamp'
]);

/**
 * AI-powered product enrichment
 * Generates: better type, tags, keywords, and rich summary
 */
async function enrichProductWithAI(product, env) {
  // Use OpenAI GPT-4o-mini (best quality, only $0.26 total) or Cloudflare AI (free but lower quality)
  const useCloudflareAI = false; // Set to true for FREE Cloudflare AI, false for better OpenAI

  try {
    const { title, fulltitle, description, content, tags, categories, price } = product;
    
    const prompt = `Analyseer dit kunstproduct en genereer metadata voor betere zoekbaarheid.

PRODUCT:
Titel: ${title}
${fulltitle && fulltitle !== title ? `Volledige titel: ${fulltitle}` : ''}
${description ? `Beschrijving: ${description.substring(0, 500)}` : ''}
${content ? `Details: ${content.substring(0, 500)}` : ''}
Prijs: €${price || '?'}
Tags: ${tags.join(', ')}
Categorieën: ${categories.join(', ')}

TAAK: Genereer JSON met:
1. "type": enkelvoud product type uit: ${Array.from(ALLOWED_TYPES).join(', ')} (of null)
2. "tags": array met 5-10 relevante zoektags (Nederlands, enkelvoud)
3. "keywords": komma-gescheiden zoektermen die mensen zouden gebruiken
4. "summary": 2-3 zinnen rijke beschrijving voor semantic search

REGELS:
- Type moet exact matchen met allowed types of null zijn
- Tags: array van strings, concreet en relevant (kunstenaar, stijl, materiaal, thema)
- Keywords: string met komma's
- Summary: beschrijvend, natuurlijk Nederlands

Geef alleen valid JSON terug zonder markdown formatting.`;

    let result;

    if (useCloudflareAI && env.AI) {
      // Use FREE Cloudflare AI (Llama 3.1)
      const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
        messages: [
          { role: 'system', content: 'Je bent een product metadata expert voor een Nederlandse kunstwebshop. Antwoord alleen met valid JSON, geen markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.3
      });

      // Parse Cloudflare AI response
      let text = aiResponse.response || '';
      // Remove markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(text);

    } else if (env.OPENAI_API_KEY) {
      // Use OpenAI Responses API with structured outputs
      const data = await callOpenAIResponses(env, {
        instructions: 'Je bent een product metadata expert voor een Nederlandse kunstwebshop.',
        input: prompt,
        tools: [{
          type: 'function',
          name: 'enrich_product',
          description: 'Generate product metadata',
          parameters: {
            type: 'object',
            properties: {
              type: { 
                type: ['string', 'null'],
                enum: [...ALLOWED_TYPES, null],
                description: 'Product type or null'
              },
              tags: { 
                type: 'array',
                items: { type: 'string' },
                description: '5-10 relevant search tags'
              },
              keywords: { 
                type: 'string',
                description: 'Comma-separated search terms'
              },
              summary: { 
                type: 'string',
                description: '2-3 sentence rich description'
              }
            },
            required: ['type', 'tags', 'keywords', 'summary'],
            additionalProperties: false
          },
          strict: true
        }],
        tool_choice: { type: 'function', name: 'enrich_product' },
        temperature: 0.3
      });

      const functionCall = data.output?.find(item => item.type === 'function_call');
      if (!functionCall) {
        console.warn(`No function call in OpenAI response for ${title}`);
        return { ai_type: null, ai_tags: [], ai_keywords: '', ai_summary: '' };
      }

      result = JSON.parse(functionCall.arguments);
    } else {
      // No AI available
      return { ai_type: null, ai_tags: [], ai_keywords: '', ai_summary: '' };
    }

    return {
      ai_type: ALLOWED_TYPES.has(result.type) ? result.type : null,
      ai_tags: Array.isArray(result.tags) ? result.tags : [],
      ai_keywords: result.keywords || '',
      ai_summary: result.summary || ''
    };

  } catch (error) {
    console.warn(`AI enrichment error for ${product.title}:`, error.message);
    return { ai_type: null, ai_tags: [], ai_keywords: '', ai_summary: '' };
  }
}

function detectType(product, { tags = [], categories = [], description = '', content = '' } = {}) {
  const haystack = [
    product.fulltitle,
    product.title,
    tags.join(' '),
    categories.join(' '),
    description,
    content
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // PRIORITY 1: Direct type match (most reliable)
  // Check for both singular and plural forms
  for (const type of ALLOWED_TYPES) {
    if (haystack.includes(type)) return type;
    // Also check plural (add 's' or common variations)
    if (haystack.includes(type + 's')) return type;
    if (haystack.includes(type + 'en')) return type; // Dutch plural: beeld → beelden
  }

  // PRIORITY 2: Strong indicators (only if no direct type found)
  // These are keywords that STRONGLY suggest a specific type
  const strongIndicators = {
    'poster': ['zeefdruk', 'lithografie', 'giclée', 'giclee'],
    'beeld': ['sculptuur', 'bronze', 'brons', 'verbronsd']
  };

  for (const [type, keywords] of Object.entries(strongIndicators)) {
    if (keywords.some(keyword => haystack.includes(keyword))) {
      return type;
    }
  }

  // PRIORITY 3: Weak indicators (only for specific cases like ballonhond, Jeff Koons)
  // Only apply if title contains specific patterns
  const title = product.title?.toLowerCase() || '';
  
  if (title.includes('ballon') || title.includes('koons')) {
    // Ballonhond, Jeff Koons sculptures
    return 'beeld';
  }

  return null;
}

function extractPricing(product, variants) {
  const items = [...variants, product];

  const candidates = items
    .map((item) => {
      const base = [item?.priceIncl, item?.price_incl, item?.price]
        .map(parseAmount)
        .find((n) => n > 0) || 0;
      if (base <= 0) return null;

      const discount = [item?.discountPrice, item?.discount_price]
        .map(parseAmount)
        .find((n) => n > 0) || 0;
      const old = [item?.oldPriceIncl, item?.oldPriceExcl, item?.oldPrice, item?.compareAtPrice]
        .map(parseAmount)
        .find((n) => n > 0) || 0;

      let currentPrice = base;
      let originalPrice = null;

      if (discount > 0 && discount < base) {
        originalPrice = base;
        currentPrice = discount;
      } else if (old > 0 && old > base) {
        originalPrice = old;
        currentPrice = base;
      }

      const strength = originalPrice ? originalPrice - currentPrice : 0;

      return {
        currentPrice,
        originalPrice,
        hasDiscount: Boolean(originalPrice),
        discountPercent: originalPrice ? Math.round((1 - currentPrice / originalPrice) * 100) : null,
        strength
      };
    })
    .filter(Boolean);

  if (!candidates.length) return null;

  return candidates.reduce((acc, curr) => {
    if (!acc) return curr;
    if (curr.hasDiscount && !acc.hasDiscount) return curr;
    if (curr.hasDiscount === acc.hasDiscount) {
      if (curr.strength > acc.strength) return curr;
      if (!curr.hasDiscount && curr.currentPrice < acc.currentPrice) return curr;
    }
    return acc;
  }, null);
}

function extractSalesCount(product, variants) {
  const stats = product.statistics || {};
  const productSales = [stats.salesCount, stats.sold, product.salesCount, product.sold]
    .map(Number)
    .find((n) => Number.isFinite(n) && n > 0);
  if (Number.isFinite(productSales) && productSales > 0) return productSales;

  return variants.reduce((sum, variant) => {
    const value = [variant.stockSold, variant.sold, variant.salesCount]
      .map(Number)
      .find((n) => Number.isFinite(n) && n > 0) || 0;
    return sum + value;
  }, 0);
}

function buildLookups({ variants, tags, tagProducts, categories, categoryProducts }) {
  const tagMap = new Map(tags.map((t) => [Number(t.id), t.title || t.name]));
  const catMap = new Map(categories.map((c) => [Number(c.id), c.title || c.name]));

  const variantsByProduct = new Map();
  for (const v of variants) {
    const pid = Number(v.product?.resource?.id || v.product?.id || v.productId);
    if (!pid) continue;
    if (!variantsByProduct.has(pid)) variantsByProduct.set(pid, []);
    variantsByProduct.get(pid).push(v);
  }

  const productTags = new Map();
  for (const tp of tagProducts) {
    const pid = Number(tp.product?.resource?.id);
    const tid = Number(tp.tag?.resource?.id);
    if (pid && tid && tagMap.has(tid)) {
      if (!productTags.has(pid)) productTags.set(pid, []);
      productTags.get(pid).push(tagMap.get(tid));
    }
  }

  const productCats = new Map();
  for (const cp of categoryProducts) {
    const pid = Number(cp.product?.resource?.id);
    const cid = Number(cp.category?.resource?.id);
    if (pid && cid && catMap.has(cid)) {
      if (!productCats.has(pid)) productCats.set(pid, []);
      productCats.get(pid).push(catMap.get(cid));
    }
  }

  return { variantsByProduct, productTags, productCats };
}

function extractStock(product, variants) {
  const variantStock = variants.reduce((sum, v) => {
    const stock = [v.stock, v.quantity, v.stockLevel].map(Number).find((n) => n > 0) || 0;
    return sum + stock;
  }, 0);

  return variantStock || [product.stock, product.quantity, product.stockLevel].map(Number).find((n) => n > 0) || 0;
}

function extractImageUrl(product) {
  if (typeof product.image === 'string') return product.image;
  if (product.image?.src) return product.image.src;
  const first = Array.isArray(product.images) ? product.images[0] : null;
  return typeof first === 'string' ? first : first?.src || null;
}

async function saveProductsToD1(env, records, runId) {
  if (!env.DB) {
    throw new Error('D1 database binding missing');
  }

  const BATCH_SIZE = 50;
  let written = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    
    // Build batch insert statement (21 fields with AI enrichment columns)
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const sql = `
      INSERT OR REPLACE INTO products (
        id, title, fulltitle, description, content, type, price, originalPrice,
        hasDiscount, discountPercent, stock, salesCount, imageUrl, url,
        tags, categories, ai_tags, ai_keywords, ai_summary, searchable_text, syncVersion
      ) VALUES ${placeholders}
    `;

    const values = batch.flatMap((record) => {
      const m = record.metadata;
      
      // Build searchable_text: combine all text fields + unpacked tags/categories
      const searchableParts = [];
      if (m.title) searchableParts.push(m.title);
      if (m.fulltitle) searchableParts.push(m.fulltitle);
      if (m.description) searchableParts.push(m.description);
      if (m.content) searchableParts.push(m.content);
      if (m.tags && Array.isArray(m.tags)) {
        searchableParts.push(m.tags.join(' '));
      }
      if (m.categories && Array.isArray(m.categories)) {
        searchableParts.push(m.categories.join(' '));
      }
      const searchableText = searchableParts.filter(Boolean).join(' ');
      
      return [
        record.id,
        m.title || '',
        m.fulltitle || '',
        m.description || '',
        m.content || '',
        m.type || null,
        m.price ?? null,
        m.originalPrice ?? null,
        m.hasDiscount ? 1 : 0,
        m.discountPercent ?? null,
        m.stock ?? 0,
        m.salesCount ?? 0,
        m.imageUrl || '',
        m.url || '',
        JSON.stringify(m.tags || []),
        JSON.stringify(m.categories || []),
        JSON.stringify(m.ai_tags || []),
        m.ai_keywords || null,
        m.ai_summary || null,
        searchableText,
        runId
      ];
    });

    try {
      await env.DB.prepare(sql).bind(...values).run();
      written += batch.length;
    } catch (error) {
      console.error('Failed to save batch to D1:', error);
      // Fallback to individual inserts
      for (const record of batch) {
        try {
          const m = record.metadata;
          
          // Build searchable_text
          const searchableParts = [];
          if (m.title) searchableParts.push(m.title);
          if (m.fulltitle) searchableParts.push(m.fulltitle);
          if (m.description) searchableParts.push(m.description);
          if (m.content) searchableParts.push(m.content);
          if (m.tags && Array.isArray(m.tags)) {
            searchableParts.push(m.tags.join(' '));
          }
          if (m.categories && Array.isArray(m.categories)) {
            searchableParts.push(m.categories.join(' '));
          }
          const searchableText = searchableParts.filter(Boolean).join(' ');
          
          await env.DB.prepare(`
            INSERT OR REPLACE INTO products (
              id, title, fulltitle, description, content, type, price, originalPrice,
              hasDiscount, discountPercent, stock, salesCount, imageUrl, url,
              tags, categories, searchable_text, syncVersion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            record.id,
            m.title || '',
            m.fulltitle || '',
            m.description || '',
            m.content || '',
            m.type || null,
            m.price ?? null,
            m.originalPrice ?? null,
            m.hasDiscount ? 1 : 0,
            m.discountPercent ?? null,
            m.stock ?? 0,
            m.salesCount ?? 0,
            m.imageUrl || '',
            m.url || '',
            JSON.stringify(m.tags || []),
            JSON.stringify(m.categories || []),
            searchableText,
            runId
          ).run();
          written++;
        } catch (err) {
          console.error(`Failed to save product ${record.id}:`, err);
        }
      }
    }

    if (i + BATCH_SIZE < records.length) await sleep(50);
  }

  return written;
}

async function cleanupStaleFromD1(env, liveIds) {
  if (!env.DB) return 0;

  try {
    // Get all product IDs from D1
    const result = await env.DB.prepare('SELECT id FROM products').all();
    const dbIds = new Set(result.results.map((row) => row.id));

    // Find stale IDs (in DB but not in live set)
    const staleIds = Array.from(dbIds).filter((id) => !liveIds.has(id));

    if (staleIds.length === 0) return 0;

    // Delete stale products in batches
    const BATCH_SIZE = 100;
    let removed = 0;

    for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
      const batch = staleIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(', ');
      
      await env.DB.prepare(`DELETE FROM products WHERE id IN (${placeholders})`)
        .bind(...batch)
        .run();
      
      removed += batch.length;
    }

    return removed;
  } catch (error) {
    console.error('Cleanup from D1 failed:', error);
    return 0;
  }
}

async function saveEmbeddingsToVectorize(env, records) {
  if (!env.OPENAI_API_KEY || !env.KUNSTPAKKET_PRODUCTS_INDEX) {
    console.warn('⚠️ Skipping vectorize: OpenAI API key or INDEX binding missing');
    return 0;
  }

  const BATCH_SIZE = 50; // OpenAI can handle larger batches
  let embedded = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    
    try {
      // Build rich MARKDOWN text for each product following Cloudflare best practices
      // Using structured markdown significantly improves embedding quality
      const textsToEmbed = batch.map(record => {
        const m = record.metadata;
        const sections = [];
        
        // Main title as H2
        sections.push(`## ${m.title || m.fulltitle || 'Product'}`);
        
        // AI summary first (if available) - this is the most important semantic text
        if (m.ai_summary) {
          sections.push(`### AI Beschrijving\n${m.ai_summary}`);
        }
        
        // Full description and content
        if (m.description) sections.push(m.description);
        if (m.content) sections.push(m.content);
        
        // Type section
        if (m.type) {
          sections.push(`### Type\n${m.type}`);
        }
        
        // AI tags (if available) - more relevant than original tags
        if (m.ai_tags && Array.isArray(m.ai_tags) && m.ai_tags.length > 0) {
          sections.push(`### AI Tags\n${m.ai_tags.join(', ')}`);
        }
        
        // Original tags section (deduplicate and clean)
        if (m.tags && Array.isArray(m.tags) && m.tags.length > 0) {
          const uniqueTags = Array.from(new Set(m.tags.map(t => String(t).toLowerCase().trim())));
          sections.push(`### Tags\n${uniqueTags.join(', ')}`);
        }
        
        // AI keywords for search
        if (m.ai_keywords) {
          sections.push(`### Zoektermen\n${m.ai_keywords}`);
        }
        
        // Categories section
        if (m.categories && Array.isArray(m.categories) && m.categories.length > 0) {
          sections.push(`### Categories\n${m.categories.join(', ')}`);
        }
        
        // Price and discount info
        const priceInfo = [];
        if (m.price) priceInfo.push(`Prijs: €${m.price}`);
        if (m.hasDiscount && m.discountPercent) priceInfo.push(`Korting: ${m.discountPercent}%`);
        if (priceInfo.length > 0) {
          sections.push(`### Prijs\n${priceInfo.join(' | ')}`);
        }
        
        // Popularity
        if (m.salesCount > 0) {
          sections.push(`### Populariteit\n${m.salesCount}× verkocht`);
        }
        
        return sections.filter(Boolean).join('\n\n').substring(0, 8000); // OpenAI supports up to 8k tokens
      });

      // Generate embeddings using OpenAI text-embedding-3-small (1536-dimensional, multilingual, cost-effective)
      const openaiResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: textsToEmbed,
          encoding_format: 'float'
        })
      });

      if (!openaiResponse.ok) {
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      const data = await openaiResponse.json();
      const vectors = data.data.map(item => item.embedding);
      
      if (!vectors || vectors.length !== batch.length) {
        console.warn(`⚠️ Embedding mismatch: expected ${batch.length}, got ${vectors?.length || 0}`);
        continue;
      }

      // Prepare vectors for upload
      const vectorsToUpload = batch.map((record, idx) => ({
        id: record.id,
        values: vectors[idx],
        metadata: {
          title: record.metadata.title || '',
          description: (record.metadata.description || '').substring(0, 200),
          price: record.metadata.price ?? null,
          type: record.metadata.type || null,
          image: record.metadata.imageUrl || '',
          url: record.metadata.url || '',
          stock: record.metadata.stock ?? 0,
          salesCount: record.metadata.salesCount ?? 0,
          tags: (record.metadata.tags || []).join('|'), // Store tags as pipe-separated string
          categories: (record.metadata.categories || []).join('|') // Store categories as pipe-separated string
        }
      }));

      // Upload to Vectorize
      console.log(`📤 Upserting ${batch.length} vectors to Vectorize...`);
      const upsertResult = await env.KUNSTPAKKET_PRODUCTS_INDEX.upsert(vectorsToUpload);
      console.log(`✅ Upsert result:`, upsertResult);
      embedded += batch.length;

      if (i + BATCH_SIZE < records.length) {
        await sleep(100); // Small delay between batches
      }
    } catch (error) {
      console.error(`❌ Failed to embed batch ${i}-${i + BATCH_SIZE}:`, error);
      console.error(`Error details:`, error.message, error.stack);
      // Continue with next batch
    }
  }

  return embedded;
}

function extractEmbeddingVectors(response) {
  // Handle different response formats from embedding models
  
  // bge-large-en-v1.5 format: { data: [[0.1, 0.2, ...], [0.3, 0.4, ...]] }
  if (response?.data && Array.isArray(response.data)) {
    // If data contains arrays of numbers, return them directly
    if (response.data.length > 0 && Array.isArray(response.data[0])) {
      return response.data;
    }
    // If data contains objects with values, extract them
    return response.data.map(item => item.values || item);
  }
  
  // Direct array format
  if (Array.isArray(response)) {
    return response;
  }
  
  console.error('Unknown embedding response format:', JSON.stringify(response).substring(0, 200));
  return [];
}

async function clearBucket(env) {
  let cursor;
  let removed = 0;

  while (true) {
    const list = await withTimeout(env.KUNSTPAKKET_PRODUCTS_BUCKET.list({ cursor }), 10000, 'clear');
    const objects = list.objects || [];

    for (const obj of objects) {
      try {
        await withTimeout(env.KUNSTPAKKET_PRODUCTS_BUCKET.delete(obj.key), 5000, obj.key);
        removed++;
      } catch (err) {
        console.error('Failed to delete object', obj.key, err);
      }
    }

    if (objects.length >= 500) await sleep(50);
    if (!list.truncated) break;
    cursor = list.cursor;
  }

  return removed;
}

async function countR2Files(env) {
  let cursor;
  const stats = { totalJson: 0, totalMarkdown: 0, totalOther: 0, firstJson: null, lastJson: null, firstMarkdown: null, lastMarkdown: null };

  while (true) {
    const list = await withTimeout(env.KUNSTPAKKET_PRODUCTS_BUCKET.list({ cursor }), 10000, 'count');

    for (const obj of list.objects || []) {
      const key = obj.key;
      if (key.endsWith('.json')) {
        stats.totalJson++;
        if (!stats.firstJson) stats.firstJson = key;
        stats.lastJson = key;
      } else if (key.endsWith('.md')) {
        stats.totalMarkdown++;
        if (!stats.firstMarkdown) stats.firstMarkdown = key;
        stats.lastMarkdown = key;
      } else {
        stats.totalOther++;
      }
    }

    if (!list.truncated) break;
    cursor = list.cursor;
  }

  return {
    totalJson: stats.totalJson,
    firstJson: stats.firstJson,
    lastJson: stats.lastJson,
    totalMarkdown: stats.totalMarkdown,
    firstMarkdown: stats.firstMarkdown,
    lastMarkdown: stats.lastMarkdown,
    totalOther: stats.totalOther,
    grandTotal: stats.totalJson + stats.totalMarkdown + stats.totalOther
  };
}

function parseAmount(value) {
  if (value == null) return NaN;
  const num = Number(String(value).replace(/[^0-9,.]/g, '').replace(',', '.'));
  return Number.isFinite(num) ? num : NaN;
}

function stripHtml(html) {
  return html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms))
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
