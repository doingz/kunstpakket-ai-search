/**
 * Cloudflare Worker - Lightspeed to R2 Product Sync
 * Syncs product data from Lightspeed API to R2 as Markdown files
 * v2.0 - with embedding text generation
 */

export default {
  async scheduled(event, env, ctx) {
    const runId = crypto.randomUUID();
    ctx.waitUntil(syncProducts(env, runId));
  },

  async fetch(request, env) {
    const { pathname, searchParams } = new URL(request.url);
    const { method } = request;

    if (pathname === '/sync' && method === 'POST') {
      const runId = crypto.randomUUID();
      await syncProducts(env, runId);
      return jsonResponse({ message: 'sync completed', runId });
    }

    if (pathname === '/sync/clear' && method === 'POST') {
      const token = searchParams.get('token') || request.headers.get('x-sync-token');
      if (env.SYNC_CLEAR_TOKEN && token !== env.SYNC_CLEAR_TOKEN) {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      const removed = await clearBucket(env);
      return jsonResponse({ removed });
    }

    if (pathname === '/sync/r2-count' && method === 'GET') {
      try {
        const stats = await countR2Files(env);
        return jsonResponse(stats);
      } catch (error) {
        return jsonResponse({ error: error.message }, 500);
      }
    }

    if (pathname === '/sync/preview' && method === 'GET') {
      const id = searchParams.get('id');
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const obj = await env.PRODUCTS_BUCKET.get(`${id}.json`);
      if (!obj) return jsonResponse({ error: 'not found' }, 404);
      const data = await obj.json();
      return jsonResponse(data);
    }

    return new Response('Not found', { status: 404 });
  },

  async queue() {} // Deprecated - remove queue binding in dashboard
};

// ============================================================================
// Sync Flow
// ============================================================================

async function syncProducts(env, runId) {
  try {
    console.log(`🚀 Sync started - ${runId}`);

    // Fetch all data from Lightspeed
    const [products, variants, tags, tagProducts, categories, categoryProducts] = await Promise.all([
      fetchLightspeedData(env, '/products.json', 'products'),
      fetchLightspeedData(env, '/variants.json', 'variants'),
      fetchLightspeedData(env, '/tags.json', 'tags'),
      fetchLightspeedData(env, '/tags/products.json', 'tagsProducts'),
      fetchLightspeedData(env, '/categories.json', 'categories'),
      fetchLightspeedData(env, '/categories/products.json', 'categoriesProducts')
    ]);

    // Build lookups and enrich
    const lookups = buildLookups({ variants, tags, tagProducts, categories, categoryProducts });
    const enriched = products
      .map(p => enrichProduct(p, lookups))
      .filter(p => p?.stock > 0 && p?.imageUrl);

    console.log(`📊 ${products.length} → ${enriched.length} products`);

    // Save to R2
    const written = await saveMarkdown(env, enriched);
    console.log(`✅ Saved ${written} files`);

    // Cleanup
    if (env.SKIP_CLEANUP !== '1') {
      const liveIds = new Set(enriched.map(p => String(p.id)));
      const removed = await cleanupStale(env, liveIds);
      console.log(`🧹 Removed ${removed} stale files`);
    }

    console.log(`📊 Completed - ${runId}`);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

// ============================================================================
// Lightspeed API
// ============================================================================

async function fetchLightspeedData(env, endpoint, key) {
  await checkRateLimit(env);
  
  // Only limit products, not relations!
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
  } catch (error) {
    console.log('⚠️ Rate limit check failed');
  }
}

// ============================================================================
// Data Processing
// ============================================================================

const TYPE_SYNONYMS = {
  mok: [
    'mok','mokken','beker','bekers','kop','kopje','koffiemok','theemok',
    'espresso mok','espresso kopje','mug','coffee mug','tea mug','cup'
  ],
  theepot: [
    'theepot','theepotten','teapot'
  ],
  kan: [
    'kan','kannen','pitcher','jug','karaf','karafje','decanter'
  ],
  vaas: [
    'vaas','vazen','vase','vases','bloemenvaas','flower vase','vaasje'
  ],
  schaal: [
    'schaal','schalen','kom','kommen','bowl','fruit bowl','serveerschaal','slakom','schaaltje'
  ],
  onderzetters: [
    'onderzetter','onderzetters','coaster','coasters','glasonderzetter','glasonderzetters'
  ],
  wandbord: [
    'wandbord','wandborden','muurbord','muurplaat','wandplaat','wall plate','wall plaque','plaque'
  ],
  bord: [
    'bord','borden','plate','plates','serviesbord','decoratiebord','designbord'
  ],
  beeldje: [
    'beeldje','beeldjes','figurine','statuette','statuet'
  ],
  beeld: [
    'beeld','beelden','statue','sculptuur','sculpturen','kunstbeeld'
  ],
  kandelaar: [
    'kandelaar','kandelaars','candlestick','candle stick'
  ],
  waxinelichthouder: [
    'waxinelichthouder','waxinelichthouders','theelichthouder','theelichthouders',
    'tealight holder','tea light holder','candle holder'
  ],
  theelicht: [
    'theelicht','theelichten','tealight','tea light'
  ],
  schilderij: [
    'schilderij','schilderijen','painting','artwork','canvas','doek','linnen','print',
    'kunstdruk','art print','artprint'
  ],
  zeefdruk: [
    'zeefdruk','serigrafie','serigraph'
  ],
  'giclée': [
    'giclée','giclee'
  ],
  litho: [
    'litho','lithografie','lithograph','lithography'
  ],
  ets: [
    'ets','etsen','etching','engraving','gravure','prent'
  ],
  wijnstop: [
    'wijnstop','bottle stopper','stopper'
  ],
  wijnpakket: [
    'wijnpakket','wine gift','wine set'
  ],
  sokkel: [
    'sokkel','sokkels','plint','plinth','voetstuk','voetstukken','standaard','display stand'
  ],
  masker: [
    'masker','maskers','wandmasker','wall mask','mask','masks'
  ],
  poster: [
    'poster','posters','kunstposter','art poster'
  ],
  zandloper: [
    'zandloper','zandlopers','hourglass','hourglasses'
  ],
  schaakbord: [
    'schaakbord','schaakborden','chessboard','chess board'
  ],
  spiegeldoosje: [
    'spiegeldoosje','spiegeldoosjes','mirror box','jewel box','trinket box'
  ],
  kurkentrekker: [
    'kurkentrekker','kurkentrekkers','corkscrew','wine opener'
  ],
  geurdispenser: [
    'geurdispenser','geurdispensers','aroma diffuser','scent diffuser','fragrance dispenser'
  ],
  sfeerlamp: [
    'sfeerlamp','sfeerlampen','mood lamp','ambience lamp','decor lamp'
  ]
};

function detectType(product) {
  const searchText = [
    product.title,
    product.fulltitle,
    product.description,
    ...(product.tags || []),
    ...(product.categories || [])
  ].filter(Boolean).join(' ').toLowerCase();

  // Find best match based on synonym occurrence
  let bestMatch = null;
  let maxMatches = 0;

  for (const [type, synonyms] of Object.entries(TYPE_SYNONYMS)) {
    const matches = synonyms.filter(syn => searchText.includes(syn.toLowerCase())).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = type;
    }
  }

  return bestMatch;
}

function buildLookups({ variants, tags, tagProducts, categories, categoryProducts }) {
  const tagMap = new Map(tags.map(t => [Number(t.id), t.title || t.name]));
  const catMap = new Map(categories.map(c => [Number(c.id), c.title || c.name]));

  const variantsByProduct = new Map();
  for (const v of variants) {
    const pid = Number(v.product?.resource?.id || v.product?.id || v.productId);
    if (pid) {
      if (!variantsByProduct.has(pid)) variantsByProduct.set(pid, []);
      variantsByProduct.get(pid).push(v);
    }
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

function enrichProduct(product, { variantsByProduct, productTags, productCats }) {
  const pid = Number(product.id);
  const variants = variantsByProduct.get(pid) || [];

  const pricing = extractPricing(product, variants);
  if (!pricing) return null;

  const stock = extractStock(product, variants);
  const salesCount = extractSalesCount(product, variants);
  const imageUrl = extractImageUrl(product);

  // Filter services
  const title = product.title?.toLowerCase() || '';
  if (title.includes('verzendkosten') || title.includes('tekstplaatje')) {
    console.log(`🚫 Service excluded: ${pid}`);
      return null;
    }
    
  // Build tags with discount markers
  const tags = [...(productTags.get(pid) || [])];
  if (pricing.hasDiscount) {
    const lower = tags.map(t => t.toLowerCase());
    if (!lower.includes('korting')) tags.push('korting');
    if (!lower.includes('aanbieding')) tags.push('aanbieding');
  }

  const enrichedProduct = {
    id: pid,
    title: product.title,
    fulltitle: product.fulltitle,
    description: stripHtml(product.description),
    url: product.url ? `https://kunstpakket.nl/${product.url}.html` : null,
    imageUrl,
    ...pricing,
    stock,
    salesCount,
    tags,
    categories: productCats.get(pid) || []
  };

  // Detect type based on all available data
  const detectedType = detectType(enrichedProduct);
  if (detectedType) enrichedProduct.type = detectedType;

  return enrichedProduct;
}

function extractPricing(product, variants) {
  const getPricing = (item) => {
    const base = [item?.priceIncl, item?.price_incl, item?.price].map(parseAmount).find(n => n > 0) || 0;
    const discount = [item?.discountPrice, item?.discount_price].map(parseAmount).find(n => n > 0) || 0;
    const compare = [item?.compareAtPrice, item?.oldPrice].map(parseAmount).find(n => n > 0) || 0;

    if (base <= 0) return null;
    if (discount > 0 && discount < base) return { price: base, discountPrice: discount, hasDiscount: true, strength: base - discount };
    if (compare > 0 && compare > base) return { price: compare, discountPrice: base, hasDiscount: true, strength: compare - base };
    return { price: base, discountPrice: null, hasDiscount: false, strength: 0 };
  };

  const candidates = [...variants.map(getPricing), getPricing(product)].filter(Boolean);
  const best = candidates.reduce((acc, curr) => (!acc || curr.strength > acc.strength) ? curr : acc, null);

  if (!best) return null;

  return {
    price: best.price,
    discountPrice: best.discountPrice,
    hasDiscount: best.hasDiscount,
    discountPercent: best.hasDiscount && best.price ? Math.round((1 - best.discountPrice / best.price) * 100) : null
  };
}

function extractStock(product, variants) {
  const variantStock = variants.reduce((sum, v) => {
    const stock = [v.stock, v.quantity, v.stockLevel].map(Number).find(n => n > 0) || 0;
    return sum + stock;
  }, 0);

  return variantStock || [product.stock, product.quantity, product.stockLevel].map(Number).find(n => n > 0) || 0;
}

function extractSalesCount(product, variants) {
  const stats = product.statistics || {};
  const productSales = [stats.salesCount, stats.sold, product.salesCount, product.sold].map(Number).find(n => n > 0);
  
  if (productSales) return productSales;

  return variants.reduce((sum, v) => {
    const sales = [v.stockSold, v.sold, v.salesCount].map(Number).find(n => n > 0) || 0;
    return sum + sales;
  }, 0);
}

function extractImageUrl(product) {
  if (typeof product.image === 'string') return product.image;
  if (product.image?.src) return product.image.src;
  
  const first = Array.isArray(product.images) ? product.images[0] : null;
  return typeof first === 'string' ? first : first?.src || null;
}

// ============================================================================
// R2 Storage
// ============================================================================

async function saveMarkdown(env, products) {
  const BATCH_SIZE = 10;
  let written = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (product) => {
        const json = productToJSON(product);
        await withTimeout(
          env.PRODUCTS_BUCKET.put(`${product.id}.json`, JSON.stringify(json, null, 2), {
            httpMetadata: { contentType: 'application/json; charset=utf-8' }
          }),
          5000,
          `${product.id}.json`
        );
        return product.id;
      })
    );

    written += results.filter(r => r.status === 'fulfilled').length;
    if (i + BATCH_SIZE < products.length) await sleep(200);
  }

  return written;
}

function productToJSON(product) {
  const text = generateSearchText(product);
  
  // Prijs logica: 
  // - price = huidige prijs (na discount)
  // - originalPrice = originele prijs (alleen als hasDiscount)
  const currentPrice = product.hasDiscount && product.discountPrice 
    ? product.discountPrice 
    : product.price;
  
  return {
    id: String(product.id),
    text,
    metadata: {
      title: product.title || '',
      fulltitle: product.fulltitle || product.title || '',
      type: product.type || '',
      price: currentPrice || 0,
      originalPrice: product.hasDiscount ? (product.price || null) : null,
      hasDiscount: Boolean(product.hasDiscount),
      discountPercent: product.discountPercent || null,
      stock: product.stock || 0,
      salesCount: product.salesCount || 0,
      tags: product.tags || [],
      categories: product.categories || [],
      url: product.url || '',
      imageUrl: product.imageUrl || ''
    }
  };
}

function generateSearchText(product) {
  const parts = [];
  
  // Title
  const title = product.fulltitle || product.title;
  if (title) parts.push(title);
  
  // Type synoniemen
  if (product.type && TYPE_SYNONYMS[product.type]) {
    parts.push(TYPE_SYNONYMS[product.type].join(' '));
  }
  
  // Description
  if (product.description) {
    parts.push(product.description);
  }
  
  // Tags
  if (product.tags?.length) {
    parts.push(product.tags.join(' '));
  }
  
  // Categories
  if (product.categories?.length) {
    parts.push(product.categories.join(' '));
  }
  
  return parts.filter(Boolean).join('. ').toLowerCase();
}

async function cleanupStale(env, liveIds) {
  let cursor;
  let removed = 0;

  while (true) {
    const list = await withTimeout(env.PRODUCTS_BUCKET.list({ cursor }), 10000, 'cleanup');

    for (const obj of list.objects || []) {
      const key = obj.key;
      const isJson = key.endsWith('.json');
      const isMarkdown = key.endsWith('.md');

      if (!isJson && !isMarkdown) continue;

      const id = key.replace(isJson ? '.json' : '.md', '');

      if (isMarkdown) {
        try {
          await withTimeout(env.PRODUCTS_BUCKET.delete(key), 5000, key);
          removed++;
        } catch (err) {
          console.error('Failed to delete markdown file during cleanup:', key, err);
        }
        continue;
      }

      if (/^\d+$/.test(id) && !liveIds.has(id)) {
        await withTimeout(env.PRODUCTS_BUCKET.delete(key), 5000, key);
        removed++;
      }
    }

    if (!list.truncated) break;
    cursor = list.cursor;
  }

  return removed;
}

async function clearBucket(env) {
  let cursor;
  let removed = 0;

  while (true) {
    const list = await withTimeout(env.PRODUCTS_BUCKET.list({ cursor }), 10000, 'clear');
    const objects = list.objects || [];

    for (const obj of objects) {
      try {
        await withTimeout(env.PRODUCTS_BUCKET.delete(obj.key), 5000, obj.key);
          removed++;
      } catch (err) {
        console.error('Failed to delete object', obj.key, err);
        }
      }

    if (objects.length && objects.length >= 500) {
      // Yield control to avoid long single requests
      await sleep(50);
    }

    if (!list.truncated) break;
    cursor = list.cursor;
  }

  return removed;
}

async function countR2Files(env) {
  let cursor;

  const stats = {
    totalJson: 0,
    firstJson: null,
    lastJson: null,
    totalMarkdown: 0,
    firstMarkdown: null,
    lastMarkdown: null,
    totalOther: 0
  };

  while (true) {
    const list = await withTimeout(env.PRODUCTS_BUCKET.list({ cursor }), 10000, 'count');
    const objects = list.objects || [];

    for (const obj of objects) {
      const key = obj.key;

      if (key.endsWith('.json')) {
        stats.totalJson++;
        if (!stats.firstJson) stats.firstJson = key;
        stats.lastJson = key;
        continue;
      }

      if (key.endsWith('.md')) {
        stats.totalMarkdown++;
        if (!stats.firstMarkdown) stats.firstMarkdown = key;
        stats.lastMarkdown = key;
        continue;
      }

      stats.totalOther++;
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

// ============================================================================
// Utilities
// ============================================================================

function parseAmount(value) {
  if (value == null) return NaN;
  const num = Number(String(value).replace(/[^0-9,.]/g, '').replace(',', '.'));
  return Number.isFinite(num) ? num : NaN;
}

function stripHtml(html) {
  return html?.replace(/<[^>]+>/g, '').trim() || '';
}

async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms)
    )
  ]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
