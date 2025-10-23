/**
 * Vercel Edge Function for AI Search
 */
import { sql } from '@vercel/postgres';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Parse query with AI
async function parseQuery(query: string) {
  const start = Date.now();
  
  const prompt = `Parse this Dutch e-commerce search query for an art & gift webshop and extract structured filters.

Search query: "${query}"

Available product categories:
- Beelden & Beeldjes (sculptures, figurines)
- Schilderijen (paintings)
- Vazen & Schalen (vases, bowls)
- Bronzen Beelden (bronze sculptures)
- Moederdag Cadeau (Mother's Day gifts)
- Relatiegeschenken (corporate gifts)
- Sportbeelden (sports figurines)
- Liefde & Huwelijk (love & wedding)
- Jubileum & Afscheid (anniversary & farewell)

Instructions:
1. Extract keywords AND include synonyms/variations (e.g. "beeldje" → ["beeldje","beeld","beelden","beeldjes","sculptuur","figurine"])
2. Detect if query matches a category (e.g. "beeldje" → categories: ["Beelden & Beeldjes"])
3. Extract attributes as tags (e.g. "hart" → ["hart","hartje","love","hearts"])
4. Parse price ranges (e.g. "max 80 euro", "tussen 50 en 100", "onder 30")

Return JSON with:
- keywords: array of search terms INCLUDING synonyms and variations (Dutch + English)
- categories: array of matching category names
- tags: array of tags/attributes with synonyms
- price_min: number or null
- price_max: number or null
- confidence: 0.0-1.0

Examples:
Input: "beeldje met hart max 80 euro"
Output: {"keywords":["beeldje","beeld","beelden","sculptuur","figurine"],"categories":["Beelden & Beeldjes"],"tags":["hart","hartje","love","hearts"],"price_min":null,"price_max":80,"confidence":0.95}

Input: "klein schilderij voor moederdag onder 50 euro"
Output: {"keywords":["schilderij","schilderijen","painting","kunst"],"categories":["Schilderijen","Moederdag Cadeau"],"tags":["klein","small"],"price_min":null,"price_max":50,"confidence":0.9}

Input: "bronzen beeld muzikant"
Output: {"keywords":["bronzen","brons","bronze","beeld","beelden","sculptuur"],"categories":["Bronzen Beelden","Beelden Muziek"],"tags":["muzikant","musicus","musician","music"],"price_min":null,"price_max":null,"confidence":0.85}

Only return valid JSON, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    });

    const content = response.choices[0].message.content?.trim() || '{}';
    const parsed = JSON.parse(content);
    
    return {
      original: query,
      parsed,
      confidence: parsed.confidence || 0.8,
      took_ms: Date.now() - start
    };
  } catch (error) {
    console.error('AI parse error:', error);
    return {
      original: query,
      parsed: { keywords: [query] },
      confidence: 0.5,
      took_ms: Date.now() - start
    };
  }
}

// Build SQL search query
function buildSearchQuery(filters: any) {
  let conditions = ['is_visible = true'];
  const params: any[] = [];
  let paramIndex = 1;

  // Full-text search with fuzzy matching
  if (filters.keywords && filters.keywords.length > 0) {
    const searchTerm = filters.keywords.join(' ');
    params.push(searchTerm);
    params.push(`%${searchTerm}%`);
    
    // Combine full-text search with LIKE for broader matching
    conditions.push(`(
      search_vector @@ plainto_tsquery('dutch', $${paramIndex}) 
      OR LOWER(title) LIKE LOWER($${paramIndex + 1})
      OR LOWER(content) LIKE LOWER($${paramIndex + 1})
    )`);
    paramIndex += 2;
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

  // Tags
  if (filters.tags && filters.tags.length > 0) {
    params.push(filters.tags);
    conditions.push(`id IN (
      SELECT product_id FROM product_tags 
      WHERE tag_id IN (SELECT id FROM tags WHERE title = ANY($${paramIndex}))
    )`);
    paramIndex++;
  }

  // Categories (fuzzy matching)
  if (filters.categories && filters.categories.length > 0) {
    const categoryConditions = filters.categories.map((cat: string) => {
      params.push(`%${cat}%`);
      const idx = paramIndex++;
      return `title ILIKE $${idx}`;
    }).join(' OR ');
    
    conditions.push(`id IN (
      SELECT product_id FROM product_categories 
      WHERE category_id IN (SELECT id FROM categories WHERE ${categoryConditions})
    )`);
  }

  return { conditions, params };
}

// Search products
async function searchProducts(filters: any, limit: number, offset: number) {
  const { conditions, params } = buildSearchQuery(filters);
  
  const whereClause = conditions.join(' AND ');
  
  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`;
  const countResult = await sql.query(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0');

  // Get products
  const searchQuery = `
    SELECT id, title, full_title, content, brand, price, image, url
    FROM products
    WHERE ${whereClause}
    ORDER BY 
      CASE WHEN search_vector @@ plainto_tsquery('dutch', $1) 
           THEN ts_rank(search_vector, plainto_tsquery('dutch', $1)) 
           ELSE 0 END DESC,
      price ASC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  
  const results = await sql.query(searchQuery, [...params, limit, offset]);
  
  return {
    total,
    showing: results.rows.length,
    items: results.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      fullTitle: row.full_title,
      description: row.content,
      brand: row.brand,
      price: parseFloat(row.price),
      image: row.image,
      url: row.url
    }))
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

Keep it short (1-2 sentences), natural, and encouraging. No emojis.`;

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
    const { query, limit = 20, offset = 0 } = body;

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

    // Step 1: Parse query with AI
    const queryData = await parseQuery(query);

    // Step 2: Search database
    const results = await searchProducts(queryData.parsed, limit, offset);

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
