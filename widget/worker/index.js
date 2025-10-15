import widgetCode from './widget.txt';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const DEFAULT_TOP_K = 30;
const MAX_TOP_K = 50;
const ALLOWED_SORT_KEYS = new Set(['score', 'price', 'salesCount']);

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
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (pathname === '/widget.js') {
      // Inject WIDGET_LIVE config into the widget code
      const isLive = env.WIDGET_LIVE === 'true';
      const configInjection = `window.__KP_WIDGET_LIVE__ = ${isLive};\n`;
      const modifiedCode = configInjection + widgetCode;
      
      return new Response(modifiedCode, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate', // No cache during development
          ...CORS_HEADERS
        }
      });
    }

    if (pathname === '/ai-search' && request.method === 'POST') {
      return handleAiSearch(request, env, ctx);
    }

    // Lightspeed webhook disabled - DOM scraper handles all tracking with widget attribution
    // if (pathname === '/lightspeed-webhook' && request.method === 'POST') {
    //   return handleLightspeedWebhook(request, env, ctx);
    // }

    if (pathname === '/track-purchase-thankyou' && request.method === 'POST') {
      return handleThankyouPurchase(request, env, ctx);
    }

    return new Response('Not Found', { status: 404 });
  },

  async queue() {}
};

async function handleAiSearch(request, env, ctx) {
  const startedAt = Date.now();

  try {
    let body = {};
    try {
      body = await request.json();
    } catch (error) {
      return json({ error: 'Invalid JSON payload' }, 400);
    }

    const { query = '', limit = 20, session_id } = body;

    if (!query || !query.trim()) {
      return json({
        query: '',
        filters: {},
        products: [],
        meta: { total: 0, tookMs: Date.now() - startedAt, method: 'no_query' }
      });
    }

    // AI-powered filter extraction (smart!)
    const filters = await extractBasicFilters(query, env);
    
    // Optional: Enhance vague queries
    const enhancedQuery = enhanceQueryIfVague(query);
    
    // Pure vector search with Vectorize native filtering
    console.log(`Vector search for "${query}" (enhanced: "${enhancedQuery}")`);
    let results = await vectorSearchWithFilters(enhancedQuery, limit * 2, env, { filters });
    
    // If type filter gave 0 results, try without type (edge cases like "masker")
    if (results.length === 0 && filters.type) {
      console.log(`No results with type="${filters.type}", retrying without type filter`);
      const fallbackFilters = { ...filters, type: null };
      results = await vectorSearchWithFilters(enhancedQuery, limit * 2, env, { filters: fallbackFilters });
      // Update filters to reflect what actually worked
      if (results.length > 0) {
        filters.type = null;
      }
    }
    
    // Take top results
    const products = results.slice(0, limit);

    const tookMs = Date.now() - startedAt;
    
    // Generate AI-powered friendly message
    const friendlyMessage = await generateAiFriendlyMessage(query, products.length, filters, products, env);
    
    // Track analytics and get interaction_id
    let interactionId = null;
    try {
      interactionId = await trackSearchEvent(env, {
        sessionId: session_id,
        query,
        friendlyMessage,
        filters,
        totalResults: products.length,
        tookMs,
        method: 'vector_search',
        productIds: products.slice(0, 5).map(p => p.id)
      });
    } catch (err) {
      console.error('Analytics tracking failed:', err);
    }
    
    const response = {
      query,
      filters,
      friendlyMessage,
      products: products.map(p => ({
        id: p.id,
        title: p.title,
        price: p.price,
        originalPrice: p.originalPrice,
        hasDiscount: p.hasDiscount,
        discountPercent: p.discountPercent,
        image: p.image,
        url: p.url,
        stock: p.stock,
        type: p.type,
        tags: p.tags || [],
        categories: p.categories || [],
        score: p.score || 0 // Include similarity score for debugging
      })),
      meta: {
        total: products.length,
        tookMs,
        method: 'vector_search',
        interaction_id: interactionId
      }
    };

    return json(response);
  } catch (error) {
    console.error('AI search error:', error);
    return json({ error: error.message || 'Search failed' }, 500);
  }
}

// Extract filters using AI - much smarter than regex!
async function extractBasicFilters(query, env) {
  if (!env.OPENAI_API_KEY) {
    return extractBasicFiltersSimple(query);
  }

  try {
    const ALLOWED_TYPES = [
      'beeld', 'schilderij', 'mok', 'wandbord', 'vaas', 'schaal', 'kan', 
      'theepot', 'kandelaar', 'theelicht', 'poster', 'masker', 'klok', 
      'wijnpakket', 'onderzetters', 'wijnstop', 'kurkentrekker', 'sokkel',
      'zandloper', 'schaakbord', 'geurdispenser', 'sfeerlamp'
    ];

    const data = await callOpenAIResponses(env, {
      instructions: `Extract product type and price range from Dutch queries.

TYPE RULES - CRITICAL:
- ONLY extract type if the query LITERALLY mentions one of the allowed product types
- "olifant", "kat", "hond", "bloem" etc. are NOT product types → type: null
- User is searching FOR an olifant/kat/etc. ON a product (like beeld, schilderij, mok)
- If unsure → type: null

EXAMPLES:
- "een olifant" → type: null (olifant is not a product type!)
- "beeld van een olifant" → type: "beeld" (beeld IS a product type)
- "schilderij met een kat" → type: "schilderij"
- "Herman Brood" → type: null (artist name, not a product)

PRICE RULES:
- "rond/ongeveer X" → minPrice: X*0.5, maxPrice: X*1.5 (±50% range)
- "X euro" (exact mention) → minPrice: X*0.5, maxPrice: X*1.5 (flexible range)
- "onder X" → minPrice: null, maxPrice: X
- "vanaf X" → minPrice: X, maxPrice: null
- "tussen X en Y" → minPrice: X, maxPrice: Y`,
      input: query,
        tools: [{
          type: 'function',
            name: 'extract_filters',
        description: 'Extract type and price range from query',
            parameters: {
              type: 'object',
              properties: {
                type: {
              type: ['string', 'null'],
              enum: [...ALLOWED_TYPES, null],
              description: 'Product type or null if not mentioned'
            },
            minPrice: { 
              type: ['number', 'null'],
              description: 'Lower bound of price range (X * 0.5 for rond/ongeveer)'
            },
            maxPrice: { 
              type: ['number', 'null'],
              description: 'Upper bound of price range (X * 1.5 for rond/ongeveer)'
            }
          },
          required: ['type', 'minPrice', 'maxPrice'],
          additionalProperties: false
        },
        strict: true
      }],
      tool_choice: { type: 'function', name: 'extract_filters' }
    });

    const functionCall = data.output?.find(item => item.type === 'function_call');
    if (!functionCall) {
      console.warn('No function call in Responses API output');
      return extractBasicFiltersSimple(query);
    }

    const parsed = JSON.parse(functionCall.arguments);
    return {
      type: parsed.type || null,
      minPrice: Number.isFinite(parsed.minPrice) && parsed.minPrice > 0 ? parsed.minPrice : null,
      maxPrice: Number.isFinite(parsed.maxPrice) && parsed.maxPrice > 0 ? parsed.maxPrice : null
    };
  } catch (error) {
    console.warn('AI filter extraction error:', error);
    return extractBasicFiltersSimple(query);
  }
}

// Simple fallback if AI is not available
function extractBasicFiltersSimple(query) {
  const filters = { type: null, minPrice: null, maxPrice: null };
  const lower = query.toLowerCase();
  
  // Basic type detection
  const typePatterns = [
    { regex: /\b(beeldje|beelden|sculptuur|beeld)\b/, type: 'beeld' },
    { regex: /\b(schilderij|schilderijen|schilderijtje)\b/, type: 'schilderij' },
    { regex: /\b(mok|mokken|mokje|beker)\b/, type: 'mok' },
    { regex: /\b(vaas|vazen|vaasje|pot)\b/, type: 'vaas' },
    { regex: /\b(poster|posters)\b/, type: 'poster' }
  ];
  
  for (const { regex, type } of typePatterns) {
    if (regex.test(lower)) {
      filters.type = type;
      break;
    }
  }
  
  // Price detection priority order:
  // 1. "rond/ongeveer" - creates range (±50%)
  const roundMatch = lower.match(/(?:rond|ongeveer|circa|ca\.?)\s*[€]?\s*(\d+)/);
  if (roundMatch) {
    const price = parseInt(roundMatch[1]);
    filters.minPrice = Math.round(price * 0.5);
    filters.maxPrice = Math.round(price * 1.5);
    return filters;
  }
  
  // 2. "onder" - only maxPrice
  const maxPriceMatch = lower.match(/(?:onder|tot|max|maximaal)\s*[€]?\s*(\d+)/);
  if (maxPriceMatch) {
    filters.maxPrice = parseInt(maxPriceMatch[1]);
    return filters;
  }
  
  // 3. "vanaf" - only minPrice
  const minPriceMatch = lower.match(/(?:vanaf|boven|min|minimaal)\s*[€]?\s*(\d+)/);
  if (minPriceMatch) {
    filters.minPrice = parseInt(minPriceMatch[1]);
    return filters;
  }
  
  // 4. General price mention - create flexible range (±50%)
  const generalPriceMatch = lower.match(/[€]?\s*(\d+)\s*euro/);
  if (generalPriceMatch) {
    const price = parseInt(generalPriceMatch[1]);
    filters.minPrice = Math.round(price * 0.5);
    filters.maxPrice = Math.round(price * 1.5);
  }
  
  return filters;
}

// Enhance vague queries by adding context (simple version)
function enhanceQueryIfVague(query) {
  const words = query.trim().split(/\s+/);
  
  // If query is 3+ words, it's probably specific enough
  if (words.length >= 3) return query;
  
  // For very short queries (1-2 words), check if they mention a product type
  // If they do, query is probably specific enough
  const hasProductType = /\b(beeld|schilderij|mok|vaas|poster|wandbord)\b/i.test(query);
  if (hasProductType) return query;
  
  // For now, just return the original query
  // Could be enhanced with OpenAI query expansion in the future
  return query;
}

async function generateAiFriendlyMessage(query, resultCount, filters, topProducts, env) {
  // Fallback if no AI available
  if (!env.AI) {
    return generateFallbackMessage(query, resultCount, filters);
  }

  if (resultCount === 0) {
    return 'Helaas geen resultaten gevonden voor jouw zoekopdracht 😕';
  }

  try {
    // Show AI actual product details so it can judge match quality
    const productDetails = topProducts.slice(0, 3).map(p => 
      `"${p.title}" (€${p.price}${p.tags?.length > 0 ? ', tags: ' + p.tags.slice(0, 5).join(', ') : ''})`
    ).join('\n');
    
    const topScore = topProducts.length > 0 ? (topProducts[0].score || 0) : 0;
    
    const contextParts = [];
    if (filters.type) contextParts.push(`type=${filters.type}`);
    if (filters.minPrice || filters.maxPrice) {
      contextParts.push(`prijs=€${filters.minPrice || 0}-${filters.maxPrice || '∞'}`);
    }
    const matchQuality = topScore > 0.65 ? 'uitstekend' : topScore > 0.55 ? 'redelijk' : 'zwak';
    contextParts.push(`match=${matchQuality}`);

    const prompt = `Je bent Frederique, kunstassistent bij kunstpakket.nl 🎨

ZOEKOPDRACHT: "${query}"
FILTERS: ${contextParts.join(', ')}
AANTAL: ${resultCount} resultaten

TOP 3 PRODUCTEN:
${productDetails}

BELANGRIJKE CONTROLE:
Bevat een van de titels/tags het gezochte thema? Check dit EERST!
- Als match=zwak/redelijk EN het gezochte item staat NIET echt in titels/tags → wees eerlijk!
- Let op woordverwarring: "wandelen" ≠ "wanddecoratie", "koe" ≠ "olifant"
- Voorbeeld: zoekt "koe" maar ziet "olifant" → "Sorry, geen koe gevonden 😕"
- Voorbeeld: zoekt "wandelen" maar ziet "wanddecoratie" → "Sorry, geen wandel-items 😕"
- Voorbeeld: zoekt "€300 schilderij" en ziet schilderijen €295 → GOED: prijzen kloppen!

TAAK: Schrijf kort, warm praatje (max 1-2 zinnen, max 120 tekens).

STIJL:
- Perfect Nederlands, to the point
- 1 passende emoticon (⚽ voetbal, ❤️ hart, 🐱 kat, 🐄 koe, 🎨 kunst)
- Noem aantal als relevant
- Spreek neutraal (vaak cadeau)
- NOOIT prijzen noemen of "similarity"
- Geen vragen
- Alleen tip bij 60+ resultaten

Alleen het verhaaltje:`;

    // Use OpenAI Responses API for smarter, more honest messages
    if (env.OPENAI_API_KEY) {
      try {
        const data = await callOpenAIResponses(env, {
          instructions: 'Je bent Frederique, een vrolijke Nederlandse kunstassistent. Schrijf perfecte, natuurlijke Nederlandse teksten met correcte grammatica en idiomatische uitdrukkingen.',
          input: prompt,
          max_tokens: 80,
          temperature: 0.8
        });

        const aiText = data.output_text?.trim();
        if (aiText && aiText.length > 0 && aiText.length < 200) {
          return aiText;
        }
  } catch (error) {
        console.warn('OpenAI Responses API failed, falling back to Cloudflare AI');
      }
    }

    // Fallback to Cloudflare AI if OpenAI unavailable
    const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
        { role: 'system', content: 'Je bent Frederique, een vrolijke Nederlandse kunstassistent. Schrijf perfecte, natuurlijke Nederlandse teksten met correcte grammatica en idiomatische uitdrukkingen.' },
          { role: 'user', content: prompt }
        ],
      max_tokens: 80,
      temperature: 0.8
    });

    const aiText = extractAiText(response).trim();
    
    if (aiText && aiText.length > 0 && aiText.length < 200) {
      return aiText;
    }

    // Final fallback
    return generateFallbackMessage(query, resultCount, filters);
  } catch (error) {
    console.warn('AI friendly message generation failed:', error);
    return generateFallbackMessage(query, resultCount, filters);
  }
}

function generateFallbackMessage(query, resultCount, filters) {
  if (resultCount === 0) {
    return 'Helaas geen resultaten gevonden voor jouw zoekopdracht 😕';
  }
  
  const type = filters?.type?.toLowerCase() || '';
  const isBeeldje = type.includes('beeldje') || query.toLowerCase().includes('beeldje');
  
  let message = '';
  
  if (resultCount === 1) {
    message = `Ik heb dit mooie kunstwerk voor je gevonden! ✨`;
  } else if (resultCount <= 3) {
    message = `Wat leuk! Ik heb ${resultCount} mooie opties voor je gevonden 🎨`;
  } else if (resultCount <= 8) {
    message = `Wauw! Hier zijn ${resultCount} prachtige kunstwerken die bij je zoekopdracht passen ✨`;
  } else {
    message = `Geweldig! Ik heb maar liefst ${resultCount} mooie opties voor je 🎨`;
  }
  
  if (isBeeldje && resultCount > 0) {
    message += ' Tip: zoek op een specifiek thema (bijv. "beeldje hart") voor nog meer keuze!';
  }
  
  return message;
}

// ========================================
// VECTOR SEARCH (Primary search method)
// ========================================

async function vectorSearchWithFilters(query, limit, env, parsedQuery) {
  try {
    // Generate embedding from the original query
    // No hacks - just semantic search with metadata filtering
    const vector = await textToEmbedding(query, env);
    if (!vector.length) return [];

    const queryOptions = {
      topK: 100, // Increased to 100 (Vectorize maximum with returnMetadata='indexed')
      returnValues: false,
      returnMetadata: 'indexed' // Changed from 'all' to support topK=100
    };

    // Build Vectorize native metadata filter
    // Filter on type, price, and stock
    const filter = {};
    
    if (parsedQuery.filters.type) {
      filter.type = { $eq: parsedQuery.filters.type };
    }
    
    // Always filter out out-of-stock products
    filter.stock = { $gt: 0 };
    
    if (parsedQuery.filters.minPrice !== null || parsedQuery.filters.maxPrice !== null) {
      filter.price = {};
      if (parsedQuery.filters.minPrice !== null) {
        filter.price.$gte = parsedQuery.filters.minPrice;
      }
      if (parsedQuery.filters.maxPrice !== null) {
        filter.price.$lte = parsedQuery.filters.maxPrice;
      }
    }
    
    if (Object.keys(filter).length > 0) {
      queryOptions.filter = filter;
    }

    // Query Vectorize with native metadata filtering
    const results = await env.KUNSTPAKKET_PRODUCTS_INDEX.query(vector, queryOptions);

    if (!Array.isArray(results?.matches) || results.matches.length === 0) return [];

    // Get product IDs from vector results
    const productIds = results.matches.map(match => match.id);
    
    // Hydrate complete product data from D1 (fixes truncated URLs/images from Vectorize metadata)
    if (!env.DB) {
      console.warn('D1 database missing, falling back to Vectorize metadata');
      // Fallback to Vectorize metadata (may have truncated URLs/images)
      return results.matches.slice(0, limit).map(match => ({
        id: match.id,
        title: match.metadata.title || '',
        description: match.metadata.description || '',
        price: match.metadata.price,
        originalPrice: null,
        hasDiscount: false,
        discountPercent: null,
        image: match.metadata.image || '',
        url: match.metadata.url || '',
        stock: match.metadata.stock || 0,
        salesCount: match.metadata.salesCount || 0,
        type: match.metadata.type || null,
        tags: (match.metadata.tags || '').split('|').filter(Boolean),
        categories: (match.metadata.categories || '').split('|').filter(Boolean),
        score: match.score || 0 // Include similarity score for honesty check
      }));
    }

    // Fetch complete product data from D1 in correct order
    const placeholders = productIds.map(() => '?').join(',');
    const sql = `SELECT * FROM products WHERE id IN (${placeholders})`;
    const d1Result = await env.DB.prepare(sql).bind(...productIds).all();
    
    // Create a map for quick lookup
    const productMap = new Map(d1Result.results.map(p => [p.id, p]));
    
    // Create a scores map from vector results
    const scoreMap = new Map(results.matches.map(match => [match.id, match.score || 0]));
    
    // Return products in vector similarity order (preserve Vectorize ranking)
    const products = productIds
      .map(id => {
        const product = productMap.get(id);
        if (!product) return null;
        
        return {
          id: product.id,
          title: product.title || '',
          description: (product.description || '').substring(0, 200),
          price: product.price,
          originalPrice: product.originalPrice,
          hasDiscount: Boolean(product.hasDiscount),
          discountPercent: product.discountPercent,
          image: product.imageUrl || '',
          url: product.url || '',
          stock: product.stock || 0,
          salesCount: product.salesCount || 0,
          type: product.type || null,
          tags: product.tags ? JSON.parse(product.tags) : [],
          categories: product.categories ? JSON.parse(product.categories) : [],
          score: scoreMap.get(id) || 0 // Include similarity score for honesty check
        };
      })
      .filter(Boolean)
      .slice(0, limit);
    
    return products;
  } catch (error) {
    console.error('Vector search with filters failed:', error);
    return [];
  }
}

async function textToEmbedding(text, env) {
  if (!env.OPENAI_API_KEY) return [];
  try {
    // Use OpenAI text-embedding-3-small (1536-dimensional, cost-effective, multilingual)
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding failed: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding || [];
  } catch (error) {
    console.warn('OpenAI embedding generation failed:', error);
    return [];
  }
}

// ========================================
// ANALYTICS & TRACKING
// ========================================

async function trackSearchEvent(env, data) {
  // Track search interactions via service binding (preferred) or HTTP fallback
  if (!env.ANALYTICS && !env.ANALYTICS_API_URL) {
    console.warn('⚠️ Analytics not configured');
    return null;
  }

  try {
    const payload = {
      event_type: 'interaction',
      site_id: env.ANALYTICS_SITE_ID || 'kunstpakket-001',
      session_id: data.sessionId,
      question_text: data.query,
      answer_text: data.friendlyMessage || '',
      products_summary: data.productIds ? data.productIds.join(',') : ''
    };

    let response;
    
    // Try service binding first (more reliable for worker-to-worker)
    if (env.ANALYTICS) {
      console.log('📤 Using service binding for analytics');
      const encodedKey = base64EncodeApiKey(env.ANALYTICS_API_KEY);
      
      response = await env.ANALYTICS.fetch('https://internal/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodedKey}`
        },
        body: JSON.stringify(payload)
      });
    } else if (env.ANALYTICS_API_URL) {
      // Fallback to HTTP
      console.log('📤 Using HTTP fetch for analytics:', env.ANALYTICS_API_URL);
      const encodedKey = base64EncodeApiKey(env.ANALYTICS_API_KEY);
      
      response = await fetch(env.ANALYTICS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodedKey}`
        },
        body: JSON.stringify(payload)
      });
    }

    if (!response) {
      console.error('❌ No analytics response');
      return null;
    }

    console.log('📥 Analytics status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Analytics failed:', {
        status: response.status,
        error: errorText
      });
      return null;
    }

    const result = await response.json();
    console.log('✅ Analytics success:', result.interaction_id);
    return result.interaction_id || null;
  } catch (error) {
    console.error('❌ Analytics exception:', error.message);
    return null;
  }
}

async function handleLightspeedWebhook(request, env, ctx) {
  // Handle Lightspeed order webhook - PRIMARY method for tracking
  try {
    const body = await request.json();
    
    console.log('📦 Received Lightspeed webhook:', {
      event: body.event,
      order_id: body.order?.id,
      total: body.order?.total
    });

    // Lightspeed sends different events - we only want completed orders
    if (body.event !== 'order.completed' && body.event !== 'order.paid') {
      console.log('⏭️  Ignoring non-completed order event:', body.event);
      return json({ success: true, message: 'Event ignored' });
    }

    const order = body.order || {};
    const orderId = order.id || order.number || 'unknown';
    const orderTotal = parseFloat(order.total || order.grandTotal || 0);
    
    // Extract products from Lightspeed webhook
    const items = (order.items || order.products || []).map(item => ({
      name: item.title || item.name || item.productTitle,
      title: item.title || item.name || item.productTitle,
      quantity: parseInt(item.quantity || item.qty || 1),
      price: parseFloat(item.price || item.priceIncl || 0),
      product_id: item.productId || item.id
    }));

    console.log('📦 Webhook order data:', {
      order_id: orderId,
      total: orderTotal,
      items_count: items.length
    });

    // Strategy: Try to find a recent interaction_id that matches this order
    // If found: track with that interaction_id (perfect!)
    // If not found: create synthetic interaction for webhook-only orders
    // Analytics API will validate if interaction exists
    
    // Try to extract customer email from order to find matching interaction
    const customerEmail = order.customer?.email || order.email || null;
    
    console.log('🔍 Looking for matching interaction for customer:', customerEmail);
    
    const productsSummary = items.map(i => {
      const qty = i.quantity || 1;
      return qty > 1 ? `${i.name} (${qty}x)` : i.name;
    }).join(', ');

    // For now: create a synthetic interaction
    // Later: query analytics DB to find real interaction_id by customer email/session
    // Analytics will validate if this is a real widget-driven purchase
    console.log('📝 Creating webhook interaction (will be validated by analytics)');
    
    // Create interaction first
    const interactionPayload = {
      event_type: 'interaction',
      site_id: env.ANALYTICS_SITE_ID || 'kunstpakket-001',
      session_id: 'webhook-' + orderId,
      question_text: 'Direct purchase (no widget search)',
      answer_text: 'Order via webhook',
      products_summary: productsSummary
    };

    if (!env.ANALYTICS && !env.ANALYTICS_API_URL) {
      return json({ success: false, message: 'Analytics not configured' }, 500);
    }

    const encodedKey = base64EncodeApiKey(env.ANALYTICS_API_KEY);
    let interactionResponse;

    // Create interaction
    if (env.ANALYTICS) {
      interactionResponse = await env.ANALYTICS.fetch('https://internal/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodedKey}`
        },
        body: JSON.stringify(interactionPayload)
      });
    } else {
      interactionResponse = await fetch(env.ANALYTICS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodedKey}`
        },
        body: JSON.stringify(interactionPayload)
      });
    }

    if (!interactionResponse.ok) {
      console.error('❌ Failed to create interaction:', await interactionResponse.text());
      return json({ success: false, message: 'Failed to create interaction' }, 500);
    }

    const interactionResult = await interactionResponse.json();
    const interactionId = interactionResult.interaction_id;
    
    console.log('✅ Created interaction:', interactionId);

    // Now create the purchase with the real interaction_id
    const purchasePayload = {
      event_type: 'purchase',
      site_id: env.ANALYTICS_SITE_ID || 'kunstpakket-001',
      interaction_id: interactionId,
      total_amount: orderTotal,
      commission_amount: orderTotal * 0.10,
      currency_code: 'EUR',
      products_summary: productsSummary
    };

    console.log('📤 Sending purchase to analytics:', purchasePayload);

    let response;

    if (env.ANALYTICS) {
      response = await env.ANALYTICS.fetch('https://internal/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodedKey}`
        },
        body: JSON.stringify(purchasePayload)
      });
    } else {
      response = await fetch(env.ANALYTICS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodedKey}`
        },
        body: JSON.stringify(purchasePayload)
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Analytics tracking failed:', errorText);
      return json({
        success: false,
        message: 'Analytics tracking failed',
        error: errorText
      }, response.status);
    }

    const result = await response.json();
    console.log('✅ Webhook purchase tracked successfully');
    
    return json({
      success: true,
      message: 'Purchase tracked via webhook (synthetic interaction)',
      response: result,
      note: 'Widget interactions from DOM scraper take precedence'
    });
    
  } catch (error) {
    console.error('❌ Lightspeed webhook error:', error);
    return json({
      success: false,
      message: error.message || 'Webhook processing failed'
    }, 500);
  }
}

async function handleThankyouPurchase(request, env, ctx) {
  // Handle purchase tracking via service binding or HTTP
  try {
    const body = await request.json();
    const { interaction_id, order_id, order_total, commission_amount, items } = body;

    console.log('Received thankyou purchase request:', {
      interaction_id,
      order_id,
      order_total,
      commission_amount,
      items_count: items?.length
    });

    if (!interaction_id) {
      return json({ success: false, message: 'interaction_id is required' }, 400);
    }

    if (!env.ANALYTICS && !env.ANALYTICS_API_URL) {
      return json({ success: false, message: 'Analytics not configured' }, 500);
    }

    // Calculate commission: either from order_total (10%) or use provided commission_amount
    const commission = commission_amount || (order_total ? order_total * 0.10 : 10);
    const totalAmount = order_total || (commission_amount ? commission_amount * 10 : 100);
    
    // Format products_summary: "Product 1 (2x), Product 2 (1x), ..." or from array
    let productsSummary = '';
    if (typeof items === 'string') {
      productsSummary = items; // Already a string
    } else if (Array.isArray(items) && items.length > 0) {
      productsSummary = items.map(item => {
        const name = item.title || item.name || 'Product';
        const qty = item.quantity || 1;
        return qty > 1 ? `${name} (${qty}x)` : name;
      }).join(', ');
    }
    
    const payload = {
      event_type: 'purchase',
      site_id: env.ANALYTICS_SITE_ID || 'kunstpakket-001',
      interaction_id,
      total_amount: totalAmount,
      commission_amount: commission,
      currency_code: 'EUR',
      products_summary: productsSummary || null
    };

    const encodedKey = base64EncodeApiKey(env.ANALYTICS_API_KEY);
    let response;

    if (env.ANALYTICS) {
      console.log('Using service binding for purchase');
      response = await env.ANALYTICS.fetch('https://internal/event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodedKey}`
        },
        body: JSON.stringify(payload)
      });
    } else {
      console.log('Using HTTP for purchase');
      response = await fetch(env.ANALYTICS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${encodedKey}`
        },
        body: JSON.stringify(payload)
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      return json({
        success: false,
        message: 'Analytics tracking failed',
        error: errorText
      }, response.status);
    }

    const result = await response.json();
    return json({
      success: true,
      response: result,
      message: 'Purchase tracked successfully'
    });
  } catch (error) {
    console.error('Purchase tracking error:', error);
    return json({
      success: false,
      message: error.message || 'Purchase tracking failed'
    }, 500);
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function base64EncodeApiKey(apiKey) {
  // Cloudflare Workers compatible base64 encoding
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(apiKey);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  } catch (error) {
    console.error('Base64 encoding failed:', error);
    return apiKey; // fallback to plain key
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
        headers: {
          'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

function extractAiText(aiResponse) {
  if (typeof aiResponse === 'string') return aiResponse;
  if (aiResponse?.response) return aiResponse.response;
  if (aiResponse?.choices?.[0]?.message?.content) return aiResponse.choices[0].message.content;
  return '';
}

// Legacy helper - kept for compatibility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
