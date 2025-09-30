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
  onderzetters: [
    'onderzetter','onderzetters','coaster','coasters','glasonderzetter','glasonderzetters',
    'drankonderzetter','tafelonderzetter'
  ],
  schilderij: [
    'schilderij','schilderijen','painting','artwork','canvas','doek','linnen','print',
    'poster','reproductie','giclée','giclee','zeefdruk','houtdruk','ets','etsen',
    'gravure','serigrafie','kunstdruk','litho'
  ],
  mok: [
    'mok','mokje','mokken','beker','bekers','kop','kopje','koffiemok','theemok',
    'espresso','espresso kopje','mug','coffee mug','tea mug','cup'
  ],
  schaal: [
    'schaal','schalen','kom','kommen','dish','dishes','bowl','fruit bowl',
    'serveerschaal','servingschaal','slakom','slabowl'
  ],
  beeldje: [
    'beeldje','beeldjes','sculptuur','sculpturen','figuur','figuren','figurine',
    'statue','statuette','beeld','beelden','kunstbeeld','bronzen beeld',
    'verbronsd','resin beeld','kunstsculptuur'
  ],
  vaas: [
    'vaas','vazen','vase','vases','bloemenvaas','flower vase','decoratieve vaas',
    'glass vase','keramische vaas','porseleinen vaas'
  ],
  bord: [
    'bord','borden','plate','plates','wandbord','decoratiebord','serviesbord',
    'porseleinen bord','keramisch bord','designbord'
  ],
  masker: [
    'masker','maskers','mask','masks','venetiaans','venetian mask','tribal mask',
    'wandmasker','wall mask','africaans masker','ceremonieel masker'
  ],
  cadeau: [
    'cadeau','cadeaus','gift','gifts','present','geschenk','souvenir','kado',
    'cadeauartikel','relatiegeschenk','gift item','giftware'
  ],
  keramiek: [
    'keramiek','ceramics','ceramic','aardewerk','pottery','stoneware',
    'porselein','porcelain','handgemaakt keramiek'
  ],
  glaswerk: [
    'glaswerk','glas','glazen','glass','glassware','kristal','crystal','handgeblazen',
    'vaasje glas','decoratief glas'
  ],
  kunstobject: [
    'kunstobject','kunstobjecten','designobject','design objects','art object',
    'art piece','artwork object','decoratie','decoratief object','uniek kunstwerk'
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
        const md = productToMarkdown(product);
      await withTimeout(
          env.PRODUCTS_BUCKET.put(`${product.id}.md`, md, {
          httpMetadata: { contentType: 'text/markdown; charset=utf-8' }
        }),
          5000,
          `${product.id}.md`
        );
        return product.id;
      })
    );

    written += results.filter(r => r.status === 'fulfilled').length;
    if (i + BATCH_SIZE < products.length) await sleep(200);
  }

  return written;
}

function productToMarkdown(product) {
  const esc = (s) => String(s || '').replace(/"/g, '\\"').replace(/\n+/g, ' ').trim();
  const list = (arr) => (arr || []).map(v => `  - "${esc(v)}"`).join('\n');
  
  const fields = [
    '---',
    `id: ${product.id}`,
    `title: "${esc(product.title)}"`,
    product.fulltitle && `fulltitle: "${esc(product.fulltitle?.replace(/\.$/, ''))}"`,
    product.type && `type: "${product.type}"`,
    product.description && `description: "${esc(product.description)}"`,
    product.price != null && `price: ${product.price}`,
    product.discountPrice != null && `discountPrice: ${product.discountPrice}`,
    `hasDiscount: ${Boolean(product.hasDiscount)}`,
    product.discountPercent != null && `discountPercent: ${product.discountPercent}`,
    `stock: ${product.stock || 0}`,
    `salesCount: ${product.salesCount || 0}`,
    product.url && `url: "${esc(product.url)}"`,
    product.imageUrl && `imageUrl: "${esc(product.imageUrl)}"`,
    'tags:',
    list(product.tags),
    'categories:',
    list(product.categories),
    '---'
  ].filter(Boolean).join('\n');

  const body = generateEmbeddingText(product);
  return fields + '\n\n' + body;
}

const TYPE_DESCRIPTIONS = {
  onderzetters: ['onderzetter', 'onderzetters', 'coaster', 'coasters', 'glasonderzetter', 'tafelonderzetter', 'drinkonderzetter'],
  schilderij: ['schilderij', 'schilderijen', 'kunstwerk', 'artwork', 'canvas', 'doek', 'print', 'poster', 'reproductie', 'giclée', 'zeefdruk', 'kunstdruk'],
  mok: ['mok', 'mokken', 'beker', 'bekers', 'koffiemok', 'theemok', 'kop', 'kopje', 'espressokop', 'drinkbeker'],
  schaal: ['schaal', 'schalen', 'kom', 'kommen', 'bowl', 'serveerschaal', 'fruitschaal', 'decoratieschaal'],
  beeldje: ['beeldje', 'beeldjes', 'beeld', 'beelden', 'sculptuur', 'sculpturen', 'figuur', 'figuren', 'bronzen beeld', 'verbronsd beeld', 'kunstbeeld', 'decoratief beeld'],
  vaas: ['vaas', 'vazen', 'bloemenvaas', 'decoratieve vaas', 'keramische vaas', 'glazen vaas'],
  bord: ['bord', 'borden', 'wandbord', 'decoratiebord', 'sierbord', 'keramisch bord', 'porseleinen bord'],
  masker: ['masker', 'maskers', 'wandmasker', 'venetiaans masker', 'decoratief masker', 'tribal masker'],
  cadeau: ['cadeau', 'cadeautje', 'geschenk', 'present', 'relatiegeschenk', 'kunstcadeau', 'origineel cadeau'],
  keramiek: ['keramiek', 'keramische kunst', 'aardewerk', 'pottery', 'porselein', 'handgemaakt keramiek'],
  glaswerk: ['glaswerk', 'glas', 'glazen object', 'kristal', 'handgeblazen glas', 'decoratief glas'],
  kunstobject: ['kunstobject', 'kunstobjecten', 'designobject', 'art object', 'decoratief object', 'uniek kunstwerk']
};

function generateEmbeddingText(product) {
  const parts = [];
  
  // Title
  const title = product.fulltitle || product.title;
  parts.push(`# ${title}`);
  
  // Type met synoniemen
  if (product.type && TYPE_DESCRIPTIONS[product.type]) {
    const synonyms = TYPE_DESCRIPTIONS[product.type];
    parts.push(`**Product type:** ${synonyms.join(', ')}`);
  }
  
  // Prijs met uitgebreide context
  if (product.hasDiscount && product.discountPrice) {
    const savings = product.price - product.discountPrice;
    const priceClass = getPriceClass(product.discountPrice);
    parts.push(`**AANBIEDING:** Nu €${product.discountPrice} (was €${product.price})`);
    parts.push(`**Besparing:** €${savings.toFixed(2)} (${product.discountPercent}% korting!) - ${priceClass.description}`);
    parts.push(`**Prijsklasse:** ${priceClass.range}, ${priceClass.keywords.join(', ')}`);
    parts.push(`**Geschikt voor budget:** ${priceClass.budgetRange}`);
  } else if (product.price) {
    const priceClass = getPriceClass(product.price);
    parts.push(`**Prijs:** €${product.price} - ${priceClass.description}`);
    parts.push(`**Prijsklasse:** ${priceClass.range}, ${priceClass.keywords.join(', ')}`);
    parts.push(`**Geschikt voor budget:** ${priceClass.budgetRange}`);
  }
  
  // Beschikbaarheid
  const availability = [];
  if (product.stock > 0) {
    availability.push(`Op voorraad (${product.stock} stuks)`);
    availability.push('Direct leverbaar, meteen beschikbaar, snel verzonden');
  } else {
    availability.push('Tijdelijk uitverkocht, niet op voorraad');
  }
  if (product.salesCount > 0) {
    availability.push(`Populair: al ${product.salesCount}x verkocht`);
  }
  parts.push(availability.join(' • '));
  
  // Description
  if (product.description) {
    parts.push('\n' + product.description);
  }
  
  // Metadata voor zoekbaarheid
  const searchTerms = [];
  if (product.categories?.length) {
    searchTerms.push(`**Categorieën:** ${product.categories.join(', ')}`);
  }
  if (product.tags?.length) {
    searchTerms.push(`**Kenmerken:** ${product.tags.join(', ')}`);
  }
  
  if (searchTerms.length) {
    parts.push('\n**Product informatie:**');
    parts.push(searchTerms.join(' | '));
  }
  
  return parts.filter(Boolean).join('\n');
}

function getPriceClass(price) {
  if (price < 25) {
    return {
      description: 'Zeer betaalbaar',
      range: '0-25 euro',
      budgetRange: '10-30 euro, rond 20 euro, ongeveer 20 euro',
      keywords: ['budget', 'goedkoop', 'betaalbaar', 'klein budget', 'weinig geld']
    };
  }
  if (price < 50) {
    return {
      description: 'Budget-vriendelijk',
      range: '25-50 euro',
      budgetRange: '20-60 euro, rond 40 euro, ongeveer 40 euro, 30-50 euro',
      keywords: ['budget-vriendelijk', 'betaalbaar cadeau', 'kleine prijs', 'goede prijs']
    };
  }
  if (price < 100) {
    return {
      description: 'Betaalbaar',
      range: '50-100 euro',
      budgetRange: '50-120 euro, rond 75 euro, ongeveer 75-100 euro',
      keywords: ['betaalbaar', 'redelijke prijs', 'mid-budget', 'normale prijs']
    };
  }
  if (price < 200) {
    return {
      description: 'Mid-range',
      range: '100-200 euro',
      budgetRange: '80-250 euro, rond 150 euro, ongeveer 150 euro, 100-200 euro',
      keywords: ['mid-range', 'middensegment', 'normale prijs', 'standaard budget']
    };
  }
  if (price < 400) {
    return {
      description: 'Kwaliteitsproduct',
      range: '200-400 euro',
      budgetRange: '200-500 euro, rond 300 euro, ongeveer 300 euro, 250-400 euro',
      keywords: ['kwaliteit', 'mid-high', 'goede kwaliteit', 'kwalitatief']
    };
  }
  if (price < 750) {
  return {
      description: 'Premium',
      range: '400-750 euro',
      budgetRange: '400-900 euro, rond 600 euro, ongeveer 500-750 euro',
      keywords: ['premium', 'exclusief', 'high-end', 'luxe', 'duurder']
    };
  }
  return {
    description: 'Luxe kunstwerk',
    range: 'boven 750 euro',
    budgetRange: 'boven 750 euro, 800+ euro, 1000+ euro, exclusieve kunst',
    keywords: ['luxe', 'exclusief', 'premium kunstwerk', 'high-end kunst', 'investering']
  };
}

async function cleanupStale(env, liveIds) {
  let cursor;
  let removed = 0;

  while (true) {
    const list = await withTimeout(env.PRODUCTS_BUCKET.list({ cursor }), 10000, 'cleanup');

    for (const obj of list.objects || []) {
      if (obj.key.endsWith('.md')) {
        const id = obj.key.replace('.md', '');
        if (/^\d+$/.test(id) && !liveIds.has(id)) {
          await withTimeout(env.PRODUCTS_BUCKET.delete(obj.key), 5000, obj.key);
          removed++;
        }
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

    await Promise.all(
      (list.objects || []).map(obj => 
        withTimeout(env.PRODUCTS_BUCKET.delete(obj.key), 5000, obj.key)
      )
    );
    
    removed += list.objects?.length || 0;
    if (!list.truncated) break;
    cursor = list.cursor;
  }

  return removed;
}

async function countR2Files(env) {
  let cursor;
  let total = 0;
  let first = null;
  let last = null;

  while (true) {
    const list = await withTimeout(env.PRODUCTS_BUCKET.list({ cursor }), 10000, 'count');
    const mdFiles = (list.objects || []).filter(obj => obj.key.endsWith('.md'));
    
    total += mdFiles.length;
    if (!first && mdFiles.length) first = mdFiles[0].key;
    if (mdFiles.length) last = mdFiles[mdFiles.length - 1].key;

    if (!list.truncated) break;
    cursor = list.cursor;
  }

  return { total, first, last };
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
