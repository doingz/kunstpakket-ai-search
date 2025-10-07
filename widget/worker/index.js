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

    if (pathname === '/lightspeed-webhook' && request.method === 'POST') {
      return handleLightspeedWebhook(request, env, ctx);
    }

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

    // Step 1: Parse query with AI to extract structured filters
    const parsedQuery = await parseQueryForDirectSearch(query, env);

    // Step 2: Pure vector search with AI-parsed metadata filters
    const vectorResults = await vectorSearchWithFilters(query, limit, env, parsedQuery);

    const tookMs = Date.now() - startedAt;
    
    // Generate friendly message with AI
    const friendlyMessage = await generateFriendlyMessage(query, vectorResults.length, parsedQuery.filters, env);
    
    const response = {
      query: parsedQuery.original,
      filters: parsedQuery.filters,
      friendlyMessage,
      products: vectorResults.map(p => ({
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
        categories: p.categories || []
      })),
      meta: {
        total: vectorResults.length,
        tookMs,
        method: 'vector_search_with_ai_filters'
      }
    };

    // Track analytics (with waitUntil to ensure completion)
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(
        trackSearchEvent(env, {
          sessionId: session_id,
          query: parsedQuery.original,
          filters: parsedQuery.filters,
          totalResults: vectorResults.length,
          tookMs,
          method: 'vector_search_with_ai_filters',
          productIds: vectorResults.slice(0, 5).map(p => p.id).join(',')
        }).catch(err => console.error('Analytics tracking failed:', err))
      );
    }

    return json(response);
  } catch (error) {
    console.error('AI search error:', error);
    return json({ error: error.message || 'Search failed' }, 500);
  }
}

async function generateFriendlyMessage(query, resultCount, filters, env) {
  try {
    const hasType = !!filters.type;
    const hasBudget = filters.minPrice !== null || filters.maxPrice !== null;
    const hasKeywords = filters.keywords && filters.keywords.length > 0;
    const isVague = !hasType && !hasBudget && (!hasKeywords || filters.keywords.length <= 1);

    const prompt = `Je bent Frederique, een enthousiaste kunstadviseur. Schrijf een persoonlijk berichtje over de zoekresultaten.

Zoekopdracht: "${query}"
Aantal resultaten: ${resultCount}
Type: ${filters.type || 'niet gespecificeerd'}
Budget: ${filters.minPrice || 0}-${filters.maxPrice || '∞'} euro
Kenmerken gevonden: Type ${hasType ? '✓' : '✗'}, Budget ${hasBudget ? '✓' : '✗'}, Thema ${hasKeywords ? '✓' : '✗'}

Regels:
- Maximaal 2 zinnen (of 1 langere zin)
- Gebruik 1-2 emoji's die bij kunst passen (🎨✨🖼️💎🎭)
- Wees enthousiast, persoonlijk en natuurlijk
- Begin ALTIJD met "Ik heb [aantal] [item(s)] gevonden" of variatie daarop
- Wees EERLIJK en ACCURAAT: als iemand zoekt naar "Herman Brood schilderijen" maar niet alle resultaten zijn van Herman Brood, vermeld dat er ook andere kunstenaars tussen zitten
- Als zoekterm een specifieke kunstenaar/thema is, wees dan eerlijk over wat je gevonden hebt (bijv. "waaronder ook werk van andere kunstenaars")
- Als er weinig kenmerken zijn (vage zoekopdracht), geef dan een vriendelijke tip om specifieker te zoeken
- Bij geen resultaten: "Ik heb helaas niets gevonden..." en moedig aan om anders te zoeken
- Bij veel resultaten: complimenteer de keuze maar blijf eerlijk
- Spreek in "ik"-vorm (als Frederique)

Voorbeelden van goede openingszinnen:
- "Ik heb ${resultCount} prachtige beeldjes met een hart gevonden..."
- "Ik vond ${resultCount} mooie schilderijen voor je..."
- "Ik heb ${resultCount} kunstwerken geselecteerd..."

Tips voor vage zoekopdrachten (gebruik variatie):
- "Vertel me gerust welk type kunstwerk je zoekt, of welk budget je in gedachten hebt!"
- "Tip: noem een thema of gelegenheid, dan vind ik nóg betere matches"
- "Geef me wat meer aanknopingspunten – type, budget of thema – dan help ik je beter!"

Genereer alleen het bericht, zonder quotes of uitleg:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.8
        })
      });

    if (!response.ok) {
      throw new Error('OpenAI API failed');
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content?.trim();
    
    if (message) {
      return message;
    }
  } catch (error) {
    console.error('Failed to generate friendly message:', error);
  }

  // Fallback messages
  if (resultCount === 0) return '🎨 Geen match gevonden';
  if (resultCount === 1) return '✨ Perfect gevonden!';
  if (resultCount <= 5) return `✨ ${resultCount} toppers voor jou`;
  if (resultCount <= 20) return `🎨 ${resultCount} kunstwerken geselecteerd`;
  return `🎨 ${resultCount} kunstwerken gevonden`;
}

function isQueryConcrete(parsedQuery) {
  const { type, minPrice, maxPrice, keywords } = parsedQuery.filters;

  // Has type filter
  if (type) return true;

  // Has price constraints
  if (minPrice !== null || maxPrice !== null) return true;

  // Has meaningful keywords - filter out generic/vague words
  if (keywords && keywords.length >= 1) {
    // Generic words that don't help with search
    const vagueWords = new Set([
      'mooi', 'moois', 'leuk', 'leuks', 'speciaal', 'bijzonder', 
      'origineel', 'uniek', 'iets', 'cadeau', 'geschenk'
    ]);
    
    const meaningfulKeywords = keywords.filter(k => 
      k.length >= 3 && !vagueWords.has(k.toLowerCase())
    );
    
    if (meaningfulKeywords.length >= 1) return true;
  }

  // Query is too vague for direct filtering
  return false;
}

async function parseQueryForDirectSearch(query, env) {
  const trimmed = query.trim();

  // Default structure
  const result = {
    original: trimmed,
    filters: {
      type: null,
      minPrice: null,
      maxPrice: null,
      keywords: []
    }
  };

  if (!env.AI) {
    // Fallback: basic keyword extraction
    result.filters.keywords = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    return result;
  }

  // Pre-detect type if explicitly in query (AI sometimes misses this)
  const typeVariants = {
    'beeld': ['beeld', 'beeldje', 'beelden', 'sculptuur'],
    'schilderij': ['schilderij', 'schilderijen'],
    'vaas': ['vaas', 'vazen'],
    'mok': ['mok', 'mokken', 'koffiemok', 'theemok', 'beker'],
    'wandbord': ['wandbord', 'wandborden'],
    'poster': ['poster', 'posters', 'print']
  };
  
  let preDetectedType = null;
  const queryLower = trimmed.toLowerCase();
  for (const [baseType, variants] of Object.entries(typeVariants)) {
    if (variants.some(v => new RegExp(`\\b${v}\\b`, 'i').test(queryLower))) {
      preDetectedType = baseType;
      break;
    }
  }

  try {
    // Use OpenAI GPT-4o-mini (fast, cheap, excellent function calling)
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a Dutch webshop search parser. Extract filters: type (ONLY if word in query), price (generous ranges), keywords (ROOT/STEM form for broad matching: voetballer→voetbal, bloemen→bloem, corrected spelling, no stopwords).' 
          },
          { 
            role: 'user', 
            content: `Parse Dutch query: "${trimmed}"

TYPES: beeld (beeldje/beelden/sculptuur), schilderij (schilderijen), vaas (vazen), mok (mokken/koffiemok/theemok/beker), wandbord (wandborden), poster (posters/print)

PRICE: Use these rules to calculate ranges:
- APPROXIMATE (rond/rondom/ongeveer/circa/±/plusminus/om en nabij/zo'n/pakweg/ruwweg/tegen de/omtrent/around/about/approximately/approx/roughly/near/close to/somewhere around/more or less) X → min: X×0.5, max: X×2
- UNDER (onder/maximaal/tot/minder dan/under/maximum/up to/less than/below) X → min: 0, max: X×1.2
- ABOVE (boven/minimaal/meer dan/vanaf/above/over/minimum/from/starting at/at least) X → min: X×0.8, max: X×5
- BETWEEN (tussen/between) X (en/tot/and/to) Y → min: X, max: Y
- EXACT X euro (no modifier) → min: X×0.6, max: X×1.6
IMPORTANT: Always extract BOTH minPrice and maxPrice when price is mentioned!

KEYWORDS: Extract ROOT FORM (word stem) for better matching: bloemen→bloem, honden→hond, voetballer→voetbal, schilder→schilder. Fix spelling (monderian→mondriaan, climt→klimt, moweder→moeder). Remove stopwords (de/het/een/voor/van/met/mijn/cadeau/mooi/leuk/rond/euro).` 
          }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'extract_filters',
            parameters: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['beeld', 'schilderij', 'vaas', 'mok', 'wandbord', 'poster'],
                  description: 'Product type ONLY if exact word in query, otherwise omit'
                },
                minPrice: { type: 'number', description: 'Minimum price if mentioned' },
                maxPrice: { type: 'number', description: 'Maximum price if mentioned' },
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Meaningful keywords in ROOT/STEM form (voetballer→voetbal, bloemen→bloem)'
                }
              },
              required: ['keywords']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'extract_filters' } }
      })
    });

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const data = await openaiResponse.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error('No tool call in OpenAI response');
    
    const parsed = JSON.parse(toolCall.function.arguments);

    // Use pre-detected type (from regex) or AI type (validated)
    let type = preDetectedType; // Trust regex detection first
    
    // If AI detected a different type, validate it
    if (!type && parsed.type) {
      const variants = typeVariants[parsed.type] || [parsed.type];
      if (variants.some(v => new RegExp(`\\b${v}\\b`, 'i').test(queryLower))) {
        type = parsed.type;
      }
    }
    
    result.filters.type = type;
    result.filters.minPrice = Number.isFinite(parsed.minPrice) && parsed.minPrice > 0 ? parsed.minPrice : null;
    result.filters.maxPrice = Number.isFinite(parsed.maxPrice) && parsed.maxPrice > 0 ? parsed.maxPrice : null;
    result.filters.keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean)
      : [];

    return result;
  } catch (error) {
    console.warn('AI query parsing failed, using fallback:', error);
    // Fallback to keyword extraction
    result.filters.keywords = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    return result;
  }
}

async function queryD1Products(env, parsedQuery, limit) {
  if (!env.DB) {
    throw new Error('D1 database binding missing');
  }

  const { type, minPrice, maxPrice, keywords } = parsedQuery.filters;

  // Build SQL query dynamically
  const conditions = ['stock > 0']; // Only products with stock
  const bindings = [];

  if (type) {
    conditions.push('type = ?');
    bindings.push(type);
  }

  if (minPrice !== null) {
    conditions.push('price >= ?');
    bindings.push(minPrice);
  }

  if (maxPrice !== null) {
    conditions.push('price <= ?');
    bindings.push(maxPrice);
  }

  // Filter out type from keywords (if type is already a filter, don't search for it as keyword)
  const filteredKeywords = keywords && keywords.length > 0
    ? keywords.filter(kw => kw !== type)
    : [];

  // Use FTS for keyword search if we have keywords
  let sql;
  let finalBindings = bindings;
  if (filteredKeywords.length > 0) {
    // Use prefix matching (*) to catch variants: voetballer* matches voetbal, voetballer, voetbalbeeld, etc.
    const ftsQuery = filteredKeywords.map(kw => `${kw}*`).join(' OR ');
    // FTS query using searchable_text (single combined field)
    sql = `
      SELECT 
        p.id, p.title, p.fulltitle, p.description, p.type, p.price, 
        p.originalPrice, p.hasDiscount, p.discountPercent, p.stock, 
        p.salesCount, p.imageUrl as image, p.url, p.tags, p.categories,
        fts.rank as fts_rank
      FROM products p
      INNER JOIN (
        SELECT rowid, rank 
        FROM products_fts 
        WHERE searchable_text MATCH ?
        ORDER BY rank
        LIMIT ?
      ) fts ON p.rowid = fts.rowid
      WHERE ${conditions.join(' AND ')}
      ORDER BY fts.rank
      LIMIT ?
    `;
    finalBindings = [ftsQuery, limit * 3, ...bindings, limit];
      } else {
    // No keywords, filter by type/price with smart sorting
    const targetPrice = minPrice && maxPrice ? (minPrice + maxPrice) / 2 : null;
    
    if (targetPrice) {
      // Smart sorting: prefer products UNDER budget, sorted by distance to target
      sql = `
        SELECT 
          id, title, fulltitle, description, type, price, originalPrice, 
          hasDiscount, discountPercent, stock, salesCount, 
          imageUrl as image, url, tags, categories,
          CASE 
            WHEN price <= ${targetPrice} THEN 1
            ELSE 2
          END as price_group,
          ABS(price - ${targetPrice}) as price_distance
        FROM products
        WHERE ${conditions.join(' AND ')}
        ORDER BY price_group ASC, price_distance ASC, salesCount DESC
        LIMIT ?
      `;
    } else {
      // No target price, just sort by popularity
      sql = `
        SELECT 
          id, title, fulltitle, description, type, price, originalPrice, 
          hasDiscount, discountPercent, stock, salesCount, 
          imageUrl as image, url, tags, categories
        FROM products
        WHERE ${conditions.join(' AND ')}
        ORDER BY salesCount DESC, hasDiscount DESC
        LIMIT ?
      `;
    }
    finalBindings = [...bindings, limit];
  }

  try {
    let result = await env.DB.prepare(sql).bind(...finalBindings).all();
    
    // If FTS found no results but we have BOTH keywords AND price, fallback to non-keyword search
    // (Only if price is specified - otherwise let vector search handle it)
    if (result.results.length === 0 && filteredKeywords.length > 0 && (minPrice !== null || maxPrice !== null)) {
      console.log(`No FTS results for keywords [${filteredKeywords.join(', ')}], falling back to type/price only (vector will handle keyword-only queries)`);
      
      // Retry without keywords
      // Calculate target price for smart sorting (prefer products under budget)
      const targetPrice = minPrice && maxPrice ? (minPrice + maxPrice) / 2 : null;
      
      let fallbackSql;
      if (targetPrice) {
        // Smart sorting: prefer products UNDER budget, sorted by distance to target
        fallbackSql = `
          SELECT 
            id, title, fulltitle, description, type, price, originalPrice, 
            hasDiscount, discountPercent, stock, salesCount, 
            imageUrl as image, url, tags, categories,
            CASE 
              WHEN price <= ${targetPrice} THEN 1
              ELSE 2
            END as price_group,
            ABS(price - ${targetPrice}) as price_distance
          FROM products
          WHERE ${conditions.join(' AND ')}
          ORDER BY price_group ASC, price_distance ASC, salesCount DESC
          LIMIT ?
        `;
    } else {
        // No target price, just sort by price
        fallbackSql = `
          SELECT 
            id, title, fulltitle, description, type, price, originalPrice, 
            hasDiscount, discountPercent, stock, salesCount, 
            imageUrl as image, url, tags, categories
          FROM products
          WHERE ${conditions.join(' AND ')}
          ORDER BY price ASC, salesCount DESC
          LIMIT ?
        `;
      }
      
      // Re-bind without FTS query (only type/price conditions)
      const fallbackBindings = [];
      if (type) fallbackBindings.push(type);
      if (minPrice !== null) fallbackBindings.push(minPrice);
      if (maxPrice !== null) fallbackBindings.push(maxPrice);
      fallbackBindings.push(limit);
      
      result = await env.DB.prepare(fallbackSql).bind(...fallbackBindings).all();
    }
    
    const products = result.results.map(row => {
      // Calculate relevance score based on multiple factors
      let score = 0;
      const reasons = [];

      // 1. Type match (50 points if exact type match)
      if (type && row.type === type) {
        score += 50;
      }

      // 2. Keyword match (30 points if FTS matched)
      if (filteredKeywords.length > 0 && row.fts_rank) {
        score += 30;
        reasons.push(`zoektermen gevonden`);
      }

      // 3. Price relevance (30 points total: 20 for distance, +10 bonus if under budget)
      if (minPrice !== null || maxPrice !== null) {
        const targetPrice = minPrice && maxPrice ? (minPrice + maxPrice) / 2 : (minPrice || maxPrice);
        const priceDistance = Math.abs(row.price - targetPrice);
        const priceScore = Math.max(0, 20 - (priceDistance / targetPrice) * 20);
        score += priceScore;
        
        // BONUS: Products UNDER target price get extra 10 points
        if (row.price <= targetPrice) {
          score += 10;
          reasons.push(`binnen budget (€${row.price})`);
        } else if (priceScore > 15) {
          reasons.push(`prijs past goed (€${row.price})`);
        }
      }

      // 4. Discount bonus (15 points)
      if (row.hasDiscount && row.discountPercent) {
        score += 15;
        reasons.push(`${row.discountPercent}% korting`);
      }

      // 5. Sales count (up to 10 points for popularity)
      if (row.salesCount > 0) {
        score += Math.min(10, row.salesCount);
        reasons.push(`${row.salesCount}× verkocht`);
      }

      // 6. Stock availability (5 points if in stock)
      if (row.stock > 0) {
        score += 5;
      }

      return {
        id: row.id,
        title: row.title,
        fulltitle: row.fulltitle,
        description: row.description ? row.description.substring(0, 200) : '',
        price: row.price,
        originalPrice: row.originalPrice,
        hasDiscount: Boolean(row.hasDiscount),
        discountPercent: row.discountPercent,
        image: row.image,
        url: row.url,
        stock: row.stock,
        salesCount: row.salesCount,
        type: row.type,
        tags: row.tags ? JSON.parse(row.tags) : [],
        categories: row.categories ? JSON.parse(row.categories) : [],
        relevanceScore: Math.round(score),
        matchReasons: reasons.length > 0 ? reasons : ['beschikbaar']
      };
    });

    // Sort by relevance score if we have keyword matches, otherwise already sorted by price
    if (filteredKeywords.length > 0 && products.some(p => p.matchReasons.includes('zoektermen gevonden'))) {
      products.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    return {
      products,
      total: products.length
    };
  } catch (error) {
    console.error('D1 query failed:', error);
    throw error;
  }
}

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

    if (!Array.isArray(results?.matches)) return [];

    // Map to product format and calculate keyword relevance score
    const keywords = parsedQuery.filters.keywords || [];
    const productsWithScore = results.matches.map(match => {
      const title = (match.metadata.title || '').toLowerCase();
      const description = (match.metadata.description || '').toLowerCase();
      const tagsString = (match.metadata.tags || '').toLowerCase(); // pipe-separated tags
      const categoriesString = (match.metadata.categories || '').toLowerCase(); // pipe-separated categories
      
      // Explode tags and categories into individual words for better matching
      const tagWords = tagsString.split(/[\|\s,]+/).filter(Boolean);
      const categoryWords = categoriesString.split(/[\|\s,]+/).filter(Boolean);
      
      // Calculate keyword match score with priority: tags > title > categories > description
      let keywordScore = 0;
      keywords.forEach(keyword => {
        const keywordLower = keyword.toLowerCase();
        
        // Check if keyword matches any tag word (exploded, bidirectional substring matching)
        if (tagWords.some(w => w.includes(keywordLower) || keywordLower.includes(w))) {
          keywordScore += 20; // Tags match is MOST important
        }
        
        if (title.includes(keywordLower)) keywordScore += 10; // Title match is very important
        
        // Check if keyword matches any category word (exploded, bidirectional)
        if (categoryWords.some(w => w.includes(keywordLower) || keywordLower.includes(w))) {
          keywordScore += 5; // Categories match is good
        }
        
        if (description.includes(keywordLower)) keywordScore += 3; // Description match is okay
      });
      
      return {
        product: {
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
          categories: (match.metadata.categories || '').split('|').filter(Boolean)
        },
        keywordScore,
        vectorScore: match.score || 0
      };
    });
    
    // Sort by keyword relevance first, then by vector similarity
    productsWithScore.sort((a, b) => {
      if (b.keywordScore !== a.keywordScore) {
        return b.keywordScore - a.keywordScore; // Higher keyword score first
      }
      return b.vectorScore - a.vectorScore; // Then by vector similarity
    });
    
    // Return top results based on combined scoring
    return productsWithScore.slice(0, limit).map(item => item.product);
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

async function rerankWithAi({ intent, queryInfo, products }, env) {
  if (!env.AI || !products.length) {
    return { matches: [], model: null, reason: env.AI ? 'no_products' : 'missing_ai_binding' };
  }

  const candidates = products.slice(0, 40).map((product) => ({
    id: product.id,
    title: product.title,
    description: truncate(product.description, 320),
    type: product.type,
    price: product.price,
    tags: product.tags,
    categories: product.categories,
    score: product.score
  }));

  const constraints = {
    requiredType: intent.type || null,
    price: intent.price || { min: null, max: null },
    themes: intent.themes || []
  };

  const basePayload = {
    query: {
      original: queryInfo.original,
      normalized: queryInfo.normalized || queryInfo.original,
      intent: intent.intent || 'general'
    },
    constraints,
    candidates
  };

  const model = '@cf/meta/llama-3-8b-instruct';
  const basePrompt = `Je bent een Nederlandse e-commerce assistent. Houd je strikt aan dit protocol:
1. Bekijk de constraints zorgvuldig.
2. Kies alleen producten die 100% aan de constraints voldoen.
3. Sorteer de gekozen producten op relevantie (beste eerst).
 4. Geef antwoord als JSON met exact dit schema {"matches": [{"id": string, "reason": string}]}.
 5. Gebruik dubbele aanhalingstekens, geen extra tekst, geen commentaar, geen markdown.
 6. Voeg nooit uitleg buiten het JSON-object toe.
 7. Als geen enkel product voldoet, geef {"matches": []} terug.
Voorbeeld: {"matches":[{"id":"123","reason":"komt overeen met thema hart"}]}`;

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = attempt === 0
      ? basePrompt
      : `${basePrompt}
Herinnering: jouw vorige antwoord was geen geldige JSON. Geef nu ALLEEN geldige JSON volgens het schema.`;

    try {
      const response = await env.AI.run(model, {
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify(basePayload) }
        ],
        max_output_tokens: 512
      });

      const raw = extractAiText(response).trim();
      if (!raw) {
        lastError = new Error('empty_llm_response');
        continue;
      }

      let parsed;
      try {
        parsed = parseRerankMatches(raw);
      } catch (parseError) {
        lastError = parseError instanceof Error ? parseError : new Error(String(parseError));
        continue;
      }

      if (parsed.matches.length) {
        return { matches: parsed.matches, model, reason: parsed.reason || null };
      }

      if (parsed.reason) {
        lastError = new Error(parsed.reason);
      }
      return { matches: [], model, reason: parsed.reason || 'no_llm_matches' };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn('AI rerank attempt failed:', {
        attempt,
        reason: lastError.message
      });
    }
  }

  return { matches: [], model, reason: lastError?.message || 'llm_error' };
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function sortByScore(products) {
  return [...products].sort((a, b) => {
    const aScore = Number.isFinite(Number(a.score)) ? Number(a.score) : -Infinity;
    const bScore = Number.isFinite(Number(b.score)) ? Number(b.score) : -Infinity;
    return bScore - aScore;
  });
}

function parseRerankMatches(raw) {
  const jsonFragment = extractJsonFragment(raw);
  if (!jsonFragment) {
    throw new Error('invalid_llm_json');
  }

  const parsed = JSON.parse(jsonFragment);
  const matchesSource = Array.isArray(parsed?.matches) ? parsed.matches : Array.isArray(parsed) ? parsed : [];

  const normalized = matchesSource
    .map((entry) => ({ id: String(entry.id || entry), reason: entry.reason || '' }))
    .filter((entry) => entry.id);

  const reason = typeof parsed?.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : null;

  return { matches: normalized, reason: normalized.length ? reason : reason || 'no_llm_matches' };
}

function extractJsonFragment(raw) {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // If the whole string is valid JSON, return as-is
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return trimmed;
  }

  // Try to locate the first JSON object in the text
  const startIndex = trimmed.indexOf('{');
  const endIndex = trimmed.lastIndexOf('}');

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return trimmed.slice(startIndex, endIndex + 1);
  }

  return null;
}

function buildMeta({ startedAt, limit, offset, sort, total, fallback, candidateCount, llmMatchCount, llmModel, llmReason }) {
  return {
    total,
    limit,
    offset,
    sort,
    tookMs: Date.now() - startedAt,
    fallback,
    candidateCount,
    llmMatchCount,
    llmModel,
    llmReason
  };
}

function parsePagination(searchParams, bodyLimit, bodyOffset) {
  const limitFromParams = parseNumber(searchParams.get('limit'));
  const offsetFromParams = parseNumber(searchParams.get('offset'));

  const limitCandidate = coalesceNumber(limitFromParams, bodyLimit, DEFAULT_LIMIT);
  const limit = normalizeLimit(limitCandidate);

  const offsetCandidate = coalesceNumber(offsetFromParams, bodyOffset, 0);
  const offset = Math.max(0, Number.isFinite(offsetCandidate) ? offsetCandidate : 0);

  return { limit, offset };
}

function parseSort(searchParams, bodySort) {
  const rawSort = (searchParams.get('sort') ?? bodySort ?? 'score:desc').toString().trim();
  const [keyRaw, directionRaw] = rawSort.split(':');

  const key = (keyRaw || 'score').trim();
  const direction = (directionRaw || 'desc').trim().toLowerCase();

  if (!ALLOWED_SORT_KEYS.has(key)) {
    return { key: 'score', direction: 'desc' };
  }

  return {
    key,
    direction: direction === 'asc' ? 'asc' : 'desc'
  };
}

function buildFilters(rawFilters, intent, searchParams) {
  const explicitType = rawFilters.type ?? searchParams.get('type');
  const priceMinExplicit = rawFilters.priceMin ?? searchParams.get('priceMin');
  const priceMaxExplicit = rawFilters.priceMax ?? searchParams.get('priceMax');

  const priceMin = parseNumber(priceMinExplicit ?? intent.price?.min);
  const priceMax = parseNumber(priceMaxExplicit ?? intent.price?.max);

  return {
    type: typeof explicitType === 'string' ? explicitType.trim().toLowerCase() : intent.type,
    themes: intent.themes || [],
    priceMin: Number.isFinite(priceMin) ? priceMin : null,
    priceMax: Number.isFinite(priceMax) ? priceMax : null
  };
}


function extractEmbeddingVectors(response) {
  if (!response) return [];

  // bge-m3 format: {data: [[embedding]], shape: [1, 1024]}
  if (Array.isArray(response?.data)) {
    return response.data
      .map((item) => {
        // If item is already an array (direct embedding), use it
        if (Array.isArray(item)) return item;
        // If item has embedding property, extract it
        return item?.embedding || item?.values;
      })
      .filter((embedding) => Array.isArray(embedding) && embedding.length);
  }

  if (Array.isArray(response?.embeddings)) {
    return response.embeddings.filter((embedding) => Array.isArray(embedding) && embedding.length);
  }

  return [];
}

function averageVectors(vectors) {
  if (!vectors.length) return [];
  if (vectors.length === 1) return vectors[0];

  const length = vectors[0].length;
  const acc = new Array(length).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < length; i += 1) {
      acc[i] += vector[i];
    }
  }

  for (let i = 0; i < length; i += 1) {
    acc[i] /= vectors.length;
  }

  return acc;
}


async function queryVectorIndex(vector, topK, filterObject, env) {
  if (!env.KUNSTPAKKET_PRODUCTS_INDEX) {
    throw new Error('Vectorize index binding missing (KUNSTPAKKET_PRODUCTS_INDEX)');
  }

  const queryOptions = {
    topK,
    returnValues: false,
    returnMetadata: 'all'
  };

  // Apply filters to Vectorize query for server-side filtering only when present
  if (filters && typeof filters === 'object') {
    const vectorizeFilter = buildVectorizeFilter(filters);
    if (Object.keys(vectorizeFilter).length > 0) {
      queryOptions.filter = vectorizeFilter;
    }
  }

  const results = await env.KUNSTPAKKET_PRODUCTS_INDEX.query(vector, queryOptions);

  if (Array.isArray(results?.matches)) {
    return results.matches.map((match) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata || {}
    }));
  }

  if (Array.isArray(results)) {
    return results.map((match) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata || {}
    }));
  }

  return [];
}

function buildVectorizeFilter(filters) {
  const filter = {};
  if (filters.type) {
    filter.type = { $eq: filters.type };
  }
  if (filters.themes?.length) {
    filter.themes = { $all: filters.themes };
  }
  if (filters.priceMin != null || filters.priceMax != null) {
    filter.price = {};
    if (filters.priceMin != null) filter.price.$gte = filters.priceMin;
    if (filters.priceMax != null) filter.price.$lte = filters.priceMax;
  }
  return filter;
}

async function hydrateProducts(matches, bucket) {
  if (!bucket) {
    throw new Error('R2 bucket binding missing (KUNSTPAKKET_PRODUCTS_BUCKET)');
  }

  const ids = Array.from(new Set(matches
    .map((match) => match.metadata?.product_id || match.id)
    .filter(Boolean)));

  const hydrated = await Promise.all(ids.map(async (id) => {
      try {
        const obj = await bucket.get(`${id}.json`);
        if (!obj) return null;

        const data = await obj.json();
        const meta = data.metadata || {};

  return {
        id: data.id || id,
    title: meta.fulltitle || meta.title || '',
    price: meta.price ?? null,
    originalPrice: meta.originalPrice ?? null,
        hasDiscount: Boolean(meta.hasDiscount),
    discountPercent: meta.discountPercent ?? null,
    image: meta.imageUrl || '',
        url: meta.url || '',
        stock: meta.stock ?? null,
        salesCount: meta.salesCount ?? null,
        type: meta.type || '',
        tags: meta.tags || [],
        categories: meta.categories || [],
        score: findScoreForId(matches, id)
      };
    } catch (error) {
      console.warn('Failed to hydrate product', id, error);
      return null;
    }
  }));

  return hydrated.filter(Boolean);
}

function findScoreForId(matches, id) {
  const match = matches.find((item) => (item.metadata?.product_id || item.id) === id);
  return match?.score ?? null;
}

function extractRequiredTokens(queryInfo, intent) {
  const tokens = new Set();

  const addTokens = (value) => {
    if (!value) return;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const str = String(item).trim().toLowerCase();
      if (!str) continue;
      str.split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .forEach((token) => tokens.add(token));
    }
  };

  addTokens(intent?.themes || []);
  addTokens(intent?.type);

  if (queryInfo?.normalized) {
    addTokens(queryInfo.normalized);
  }

  const numericTokens = Array.from(tokens).filter((token) => /\d/.test(token));
  const nonNumericTokens = Array.from(tokens).filter((token) => !/\d/.test(token));

  return nonNumericTokens.length ? nonNumericTokens : numericTokens;
}

function enforceRequiredTokens(matches, map, requiredTokens) {
  const retained = [];
  const removed = [];

  for (const match of matches) {
    const item = map.get(match.id);
    if (!item) {
      removed.push(match);
      continue;
    }

    const haystackParts = [
      item.title,
      item.type,
      Array.isArray(item.tags) ? item.tags.join(' ') : '',
      Array.isArray(item.categories) ? item.categories.join(' ') : '',
      item.description
    ];

    const haystack = haystackParts
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const hasAllTokens = requiredTokens.every((token) => haystack.includes(token));

    if (hasAllTokens) {
      retained.push(match);
    } else {
      removed.push(match);
    }
  }

  return { matches: retained, removed };
}

function parseNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coalesceNumber(...values) {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
    return null;
  }

function normalizeLimit(value) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  if (value <= 0) return 0;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}

function extractAiText(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (typeof response?.response === 'string') return response.response;
  if (Array.isArray(response?.output_text)) return response.output_text.join('\n');
  if (Array.isArray(response?.messages)) {
    return response.messages
      .map((message) => (typeof message?.content === 'string' ? message.content : ''))
      .join('\n');
  }
  if (Array.isArray(response?.choices)) {
    return response.choices
      .map((choice) => choice.message?.content || choice.text || '')
      .join('\n');
  }
  return '';
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

async function trackSearchEvent(env, data) {
  // Skip if analytics not configured
  if (!env.ANALYTICS_API_URL || !env.ANALYTICS_API_KEY || !env.ANALYTICS_SITE_ID || !env.ANALYTICS) {
    return;
  }

  try {
    const summary = data.totalResults > 0
      ? `${data.totalResults} resultaten gevonden (${data.tookMs}ms)`
      : 'Geen resultaten';

    const payload = {
      event_type: 'interaction',
      site_id: env.ANALYTICS_SITE_ID,
      session_id: data.sessionId || crypto.randomUUID(),
      question_text: data.query,
      answer_text: summary,
      products_summary: data.productIds || '',
      metadata: {
        total_results: data.totalResults,
        response_time_ms: data.tookMs,
        method: data.method,
        filters: data.filters
      }
    };

    // Base64 encode the API key as required by the analytics API
    const base64ApiKey = btoa(env.ANALYTICS_API_KEY);
    
    // Use Service Binding for direct worker-to-worker communication (faster & more reliable)
    const response = await env.ANALYTICS.fetch(env.ANALYTICS_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${base64ApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Silent success - only log errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Analytics tracking error: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    // Silent fail - analytics should never break search
    console.error('Analytics tracking error:', error);
  }
}

function buildFallbackResponse({ startedAt, limit, offset, sort, intent, queryInfo, filters, fallbackReason }) {
  const resolvedIntent = intent?.intent || intent || 'general';
  const originalQuery = queryInfo?.original || intent?.searchText || '';
  const normalizedQuery = queryInfo?.normalized || queryInfo?.corrected || originalQuery;

  return {
    query: {
      original: originalQuery,
      normalized: normalizedQuery,
      corrected: queryInfo?.corrected || null,
      intent: resolvedIntent,
      fallback: fallbackReason || 'fallback'
    },
    filters: filters || { type: null, themes: [], priceMin: null, priceMax: null },
    products: [],
    meta: buildMeta({
      startedAt,
      limit,
      offset,
      sort,
      total: 0,
      fallback: fallbackReason || 'fallback',
      candidateCount: 0,
      llmMatchCount: 0,
      llmModel: null,
      llmReason: fallbackReason || 'fallback'
    })
  };
}

async function handleLightspeedWebhook(request, env, ctx) {
  try {
    const webhook = await request.json();
    const order = webhook.resource;

    if (!order || !order.products) {
      console.error('Invalid webhook payload');
      return new Response('invalid payload', { status: 400 });
    }

    // Extract product IDs from order
    const productIds = order.products.map(p => p.product?.id || p.id).filter(Boolean).join(',');
    const productCount = order.products.length;

    if (!productIds) {
      console.log('⚠️ No product IDs in order:', order.number);
      return new Response('no products');
    }

    // Check D1: is there a recent interaction with these products?
    const interaction = await findRecentInteraction(env, productIds);

    if (!interaction) {
      console.log('⚠️ No AI interaction found for order:', order.number, 'products:', productIds);
      return new Response('ignored - no AI interaction');
    }

    // Commission: €10 per product (fixed rate for kunstpakket)
    const commissionAmount = productCount * 10;

    const purchasePayload = {
      event_type: 'purchase',
      site_id: env.ANALYTICS_SITE_ID,
      interaction_id: interaction.id,
      total_amount: parseFloat(order.priceIncl || order.total || 0),
      commission_amount: commissionAmount,
      currency_code: 'EUR',
      products_summary: productIds,
      metadata: {
        order_number: order.number,
        product_count: productCount
      }
    };

    // Send to analytics (non-blocking)
    if (ctx && ctx.waitUntil && env.ANALYTICS) {
      ctx.waitUntil(
        env.ANALYTICS.fetch(env.ANALYTICS_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${btoa(env.ANALYTICS_API_KEY)}`
          },
          body: JSON.stringify(purchasePayload)
        }).then(res => {
          if (res.ok) {
            console.log('✅ Purchase tracked:', {
              order: order.number,
              products: productCount,
              commission: `€${commissionAmount}`,
              interaction: interaction.id
            });
          } else {
            console.error('Analytics error:', res.status);
          }
        }).catch(err => {
          console.error('Purchase tracking failed:', err);
        })
      );
    }

    return new Response('ok');

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('error', { status: 500 });
  }
}

async function findRecentInteraction(env, productIds) {
  try {
    // Call analytics worker to find matching interaction
    const response = await env.ANALYTICS.fetch(
      'https://bluestars-analytics.lotapi.workers.dev/internal/find-interaction',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${btoa(env.ANALYTICS_API_KEY)}`
        },
        body: JSON.stringify({
          site_id: env.ANALYTICS_SITE_ID,
          product_ids: productIds,
          days_back: 7
        })
      }
    );

    if (!response.ok) {
      console.error('Find interaction error:', response.status);
      return null;
    }

    const result = await response.json();
    return result.interaction || null;
  } catch (error) {
    console.error('findRecentInteraction error:', error);
    return null;
  }
}

/**
 * Handle purchase tracking from thankyou page (temporary solution)
 */
async function handleThankyouPurchase(request, env, ctx) {
  try {
    const body = await request.json();
    const { interaction_id, order_id, commission_amount, source } = body;

    if (!interaction_id) {
      return new Response(JSON.stringify({ error: 'Missing interaction_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    // Track the purchase via analytics worker
    const trackPromise = env.ANALYTICS.fetch(
      'https://bluestars-analytics.lotapi.workers.dev/track',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${btoa(env.ANALYTICS_API_KEY)}`
        },
        body: JSON.stringify({
          site_id: env.ANALYTICS_SITE_ID,
          event_type: 'purchase',
          interaction_id,
          order_id: order_id || 'unknown',
          commission_amount: commission_amount || 10,
          metadata: { source: source || 'thankyou_page' }
        })
      }
    );

    // Fire-and-forget but guarantee completion
    ctx.waitUntil(trackPromise);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  } catch (error) {
    console.error('handleThankyouPurchase error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}

function determineTopK(limit) {
  if (limit <= 0) {
    return MAX_TOP_K;
  }

  const multiplier = 3;
  return Math.min(MAX_TOP_K, Math.max(DEFAULT_TOP_K, limit * multiplier));
}