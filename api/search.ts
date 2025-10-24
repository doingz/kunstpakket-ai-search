/**
 * Vercel Edge Function for AI Search - SIMPLIFIED
 */
import { sql } from '@vercel/postgres';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Parse query with AI - SIMPLIFIED
async function parseQuery(query: string) {
  const start = Date.now();
  
  const prompt = `Extract search terms from this Dutch e-commerce query: "${query}"

Product types (only if explicitly mentioned):
- Beeld (sculptures, figurines, statues)
- Schilderij (paintings, prints, giclees, art on canvas)
- Vaas (vases)
- Mok (mugs, cups)
- Wandbord (decorative plates)
- Schaal (bowls)
- Glasobject (glass art, crystal)

Task:
1. If query mentions a product type → extract it
2. Extract ALL relevant search words with synonyms (Dutch + English)
3. Extract price if mentioned
4. For questions, extract subject words (e.g., "zijn er romeinse goden?" → romeins, rome, roman, god, goden)
5. IMPORTANT: Use single words only! "tea light" → ["theelicht", "tealight", "candle", "kaars"]

Return JSON:
{
  "type": "Beeld" or null,
  "words": ["woord1", "synoniem1", "english1", ...],
  "price_min": number or null,
  "price_max": number or null
}

Examples:
Input: "beeldje"
Output: {"type":"Beeld","words":[],"price_min":null,"price_max":null}

Input: "beeldje met hart"
Output: {"type":"Beeld","words":["hart","heart","liefde","love"],"price_min":null,"price_max":null}

Input: "hond"
Output: {"type":null,"words":["hond","honden","hondje","dog","dogs","puppy"],"price_min":null,"price_max":null}

Input: "theelicht"
Output: {"type":null,"words":["theelicht","theelichtje","tealight","candle","kaars"],"price_min":null,"price_max":null}

Input: "zijn er romeinse goden?"
Output: {"type":null,"words":["romeins","romeinse","rome","roman","god","goden","gods","mythology"],"price_min":null,"price_max":null}

Input: "schilderij max 300"
Output: {"type":"Schilderij","words":[],"price_min":null,"price_max":300}

Input: "beeld voor een advocaat"
Output: {"type":"Beeld","words":["advocaat","justitie","rechter","law","lawyer","juridisch"],"price_min":null,"price_max":null}

Only JSON, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content?.trim() || '{}';
    const parsed = JSON.parse(content);
    
    // Ensure we always have the words array
    if (!parsed.words || !Array.isArray(parsed.words)) {
      parsed.words = [];
    }
    
    return {
      original: query,
      parsed,
      confidence: 0.8,
      took_ms: Date.now() - start
    };
  } catch (error) {
    console.error('AI parse error:', error);
    return {
      original: query,
      parsed: { 
        type: null,
        words: [query],
        price_min: null,
        price_max: null
      },
      confidence: 0.5,
      took_ms: Date.now() - start
    };
  }
}

// Build SQL search query - SIMPLIFIED
function buildSearchQuery(filters: any) {
  let conditions = ['is_visible = true'];
  const params: any[] = [];
  let paramIndex = 1;

  // Type filter (hard AND)
  if (filters.type) {
    params.push(filters.type);
    conditions.push(`type = $${paramIndex}`);
    paramIndex++;
  }

  // Words filter (OR across all words) - single full-text search
  if (filters.words && filters.words.length > 0) {
    // Handle multi-word terms: "tea light" → "tea & light"
    const searchTerms = filters.words.map((word: string) => {
      if (word.includes(' ')) {
        // Multi-word: "tea light" → "tea & light"
        return word.split(' ').join(' & ');
      }
      return word;
    });
    const searchQuery = searchTerms.join(' | '); // "hond | dog | puppy | tea & light"
    params.push(searchQuery);
    conditions.push(`search_vector @@ to_tsquery('dutch', $${paramIndex})`);
    paramIndex++;
  }

  // Price filters
  if (filters.price_min) {
    params.push(filters.price_min);
    conditions.push(`price >= $${paramIndex}`);
    paramIndex++;
  }
  if (filters.price_max) {
    params.push(filters.price_max);
    conditions.push(`price <= $${paramIndex}`);
    paramIndex++;
  }

  return { conditions, params };
}

// Format product row to consistent output format
function formatProduct(row: any) {
  return {
    id: row.id,
    title: row.title,
    fullTitle: row.full_title,
    description: row.content,
    brand: row.brand,
    price: parseFloat(row.price),
    oldPrice: row.old_price ? parseFloat(row.old_price) : null,
    onSale: row.old_price && parseFloat(row.old_price) > parseFloat(row.price),
    discount: row.old_price ? Math.round((1 - parseFloat(row.price) / parseFloat(row.old_price)) * 100) : 0,
    salesCount: row.stock_sold || 0,
    image: row.image,
    url: row.url
  };
}

// Fallback: Search by exact title match (for when query is a product title)
async function searchByExactTitle(query: string, limit: number, offset: number) {
  const searchPattern = `%${query}%`;
  
  // Count total (fuzzy matching with 30% similarity threshold for typos)
  const countQuery = `
    SELECT COUNT(*) as total 
    FROM products 
    WHERE is_visible = true 
      AND (
        LOWER(title) LIKE LOWER($1)
        OR LOWER(full_title) LIKE LOWER($1)
        OR similarity(LOWER(title), LOWER($2)) > 0.3
        OR similarity(LOWER(full_title), LOWER($2)) > 0.3
      )
  `;
  const countResult = await sql.query(countQuery, [searchPattern, query]);
  const total = parseInt(countResult.rows[0]?.total || '0');

  // Get products with exact title matching, best matches first
  // Uses fuzzy matching (trigram similarity) to catch typos/misspellings
  const searchQuery = `
    SELECT id, title, full_title, content, brand, price, old_price, stock_sold, image, url
    FROM products
    WHERE is_visible = true 
      AND (
        LOWER(title) LIKE LOWER($1)
        OR LOWER(full_title) LIKE LOWER($1)
        OR similarity(LOWER(title), LOWER($2)) > 0.3
        OR similarity(LOWER(full_title), LOWER($2)) > 0.3
      )
    ORDER BY 
      CASE 
        WHEN LOWER(title) = LOWER($2) THEN 1
        WHEN LOWER(full_title) = LOWER($2) THEN 2
        WHEN LOWER(title) LIKE LOWER($1) THEN 3
        WHEN LOWER(full_title) LIKE LOWER($1) THEN 4
        WHEN similarity(LOWER(title), LOWER($2)) > 0.6 THEN 5
        WHEN similarity(LOWER(full_title), LOWER($2)) > 0.6 THEN 6
        ELSE 7
      END ASC,
      similarity(LOWER(title), LOWER($2)) DESC,
      stock_sold DESC NULLS LAST
    LIMIT $3 OFFSET $4
  `;

  const result = await sql.query(searchQuery, [searchPattern, query, limit, offset]);

  return {
    total,
    showing: result.rows.length,
    items: result.rows.map(formatProduct)
  };
}

// Search products - SIMPLIFIED with ts_rank
async function searchProducts(filters: any, limit: number, offset: number) {
  const { conditions, params } = buildSearchQuery(filters);
  const whereClause = conditions.join(' AND ');
  
  // Count total
  const countResult = await sql.query(
    `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.total || '0');

  // Build ORDER BY with ts_rank for relevance
  let orderBy = 'stock_sold DESC NULLS LAST, price ASC'; // Default: popularity + price
  
  if (filters.words && filters.words.length > 0) {
    const searchQuery = filters.words.join(' | ');
    // Use ts_rank for relevance scoring when words are present
    orderBy = `ts_rank(search_vector, to_tsquery('dutch', '${searchQuery}')) DESC, stock_sold DESC NULLS LAST`;
  }
  
  const searchQuery = `
    SELECT id, title, full_title, content, brand, price, old_price, stock_sold, image, url
    FROM products
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const results = await sql.query(searchQuery, [...params, limit, offset]);

  return {
    total,
    showing: results.rows.length,
    items: results.rows.map(formatProduct)
  };
}

// Generate advice
async function generateAdvice(query: string, results: any) {
  if (results.total === 0) {
    return 'Helaas geen producten gevonden. Probeer een andere zoekopdracht.';
  }

  const prompt = `Write a friendly, helpful message in Dutch about these search results.

Query: "${query}"
Found: ${results.total} products
Showing: ${results.showing} products

Requirements:
- Use first person ("Ik heb...") or neutral ("Er zijn..."), NEVER use second person ("Je hebt...")
- Make it friendly, warm and inviting (2-3 sentences)
- Be natural, encouraging and conversational
- ALWAYS include ONE relevant emoji at the start of the message
- Make it feel personal and helpful

Examples:
- "🎨 Ik heb 15 prachtige mokken voor je gevonden! Van klassiek tot modern, er zit vast iets moois tussen voor jou."
- "✨ Er zijn 8 kunstwerken die perfect passen bij je zoekopdracht. Neem gerust de tijd om rond te kijken!"
- "🎁 Ik vond 12 mooie cadeaus onder €50 voor je. Hopelijk zit er iets tussen dat je zoekt!"`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 100
    });

    return response.choices[0].message.content?.trim() || 
           `Gevonden: ${results.total} producten. Bekijk de resultaten hieronder!`;
  } catch (error) {
    console.error('Advice generation error:', error);
    return `Gevonden: ${results.total} producten.`;
  }
}

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { query, limit = 1000, offset = 0 } = body;  // Default to 1000 (show all results)

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing query parameter' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Step 1: Try exact title match ONLY for longer, specific queries (likely product names)
    // Short queries like "beeldje", "mok" should use AI parsing to understand intent
    let results: any;
    let queryData: any = null;
    const isLongSpecificQuery = query.length > 20;
    
    if (isLongSpecificQuery) {
      console.log('[Search] Long query - checking for exact title match first...');
      results = await searchByExactTitle(query, limit, offset);
      
      if (results.total > 0) {
        console.log(`[Search] Found ${results.total} products by title match!`);
        // Create minimal queryData for response (without expensive AI call)
        queryData = {
          original: query,
          parsed: {
            type: null,
            keywords: [query],
            tags: [],
            price_min: null,
            price_max: null,
            confidence: 1.0,
            categories: []
          },
          confidence: 1.0,
          took_ms: 0
        };
      }
    }
    
    // Step 2: Use AI parsing for short queries or if no title match found
    if (!queryData) {
      console.log('[Search] Using AI to parse query...');
      queryData = await parseQuery(query);
      results = await searchProducts(queryData.parsed, limit, offset);
    }

    // Step 3: Generate advice
    const advice = await generateAdvice(query, results);

    const response = {
      success: true,
      query: queryData,
      results: {
        ...results,
        advice
      },
      meta: {
        took_ms: Date.now() - startTime
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error: any) {
    console.error('Search error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal error',
        message: error.message
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

export const config = {
  runtime: 'edge'
};
