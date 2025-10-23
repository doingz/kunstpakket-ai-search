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

CRITICAL INSTRUCTIONS:
1. **Include RELEVANT synonyms and product variations** for keywords:
   - Singular/plural forms (beeldje → beeldje, beeld, beelden, beeldjes)
   - Dutch AND English equivalents for THE SAME THING (beeldje → sculptuur, sculpture, figurine, statue)
   - Common typos and alternatives (beedje → beeldje, schiderijtje → schilderij)
   - IMPORTANT: Do NOT mix different product types! Be specific!
     * schilderij ↔ giclee, giclée, print, prent (these are ALL schilderijen types!)
       → schilderij, schilderijen, schildering, painting, paintings, giclee, giclée, print, prent
       → ALWAYS map to category "Schilderijen"
     * giclee/print searched? → treat as schilderij + add giclee terms
     * vaas → vaas, vazen, vase, vases (NOT schaal - that's different!)
     * mok → mok, mokken, cup, mug (NOT vaas, glas!)
     * beeld → beeld, beelden, beeldje, beeldjes, sculptuur, sculpture, figurine, statue
     * Avoid generic terms like "kunst", "art", "cadeau" as keywords
   - DO NOT just return the exact search term - always add variations!

2. Detect if query matches a category and include ALL relevant ones

3. Extract attributes as tags WITH synonyms (hart → hart, hartje, love, hearts, heart, liefde)

4. Parse price ranges intelligently:
   - "max 80 euro", "onder 50" → price_max
   - "vanaf 100", "boven 50" → price_min
   - "tussen 30 en 100", "30-100 euro" → price_min + price_max
   - "rond 50", "ongeveer 40", "om en nabij 60" → price_min = X * 0.8, price_max = X * 1.2

Return JSON with:
- keywords: array of search terms INCLUDING synonyms and variations (Dutch + English)
- categories: array of matching category names
- tags: array of tags/attributes with synonyms
- price_min: number or null
- price_max: number or null
- confidence: 0.0-1.0

GOOD Examples (notice RELEVANT synonyms only):

Input: "beeldje"
Output: {"keywords":["beeldje","beeld","beelden","beeldjes","sculptuur","sculpture","figurine","statue","figuur"],"categories":["Beelden & Beeldjes"],"tags":[],"price_min":null,"price_max":null,"confidence":0.9}

Input: "schilderij"
Output: {"keywords":["schilderij","schilderijen","schildering","painting","paintings","giclee","giclée","print","prent"],"categories":["Schilderijen"],"tags":[],"price_min":null,"price_max":null,"confidence":0.9}

Input: "giclee"
Output: {"keywords":["giclee","giclée","print","prent","schilderij","schilderijen","painting"],"categories":["Schilderijen"],"tags":[],"price_min":null,"price_max":null,"confidence":0.9}

Input: "vaas"
Output: {"keywords":["vaas","vazen","vase","vases"],"categories":["Vazen & Schalen"],"tags":[],"price_min":null,"price_max":null,"confidence":0.9}

Input: "beeldje met hart max 80 euro"
Output: {"keywords":["beeldje","beeld","beelden","beeldjes","sculptuur","sculpture","figurine","statue"],"categories":["Beelden & Beeldjes"],"tags":["hart","hartje","heart","hearts","love","liefde"],"price_min":null,"price_max":80,"confidence":0.95}

Input: "klein schilderij voor moederdag onder 50 euro"
Output: {"keywords":["schilderij","schilderijen","schildering","painting","paintings"],"categories":["Schilderijen","Moederdag Cadeau"],"tags":["klein","kleine","small","compact"],"price_min":null,"price_max":50,"confidence":0.92}

BAD Examples (DO NOT DO THIS):
Input: "schilderij"
Output: {"keywords":["schilderij","vaas","schaal","beeld"],...}
^ WRONG - vaas and schaal are NOT synonyms for schilderij!

Input: "vaas"
Output: {"keywords":["vaas","vazen","schaal","schalen","bowl"],...}
^ WRONG - schaal is different from vaas, don't mix them!

Only return valid JSON, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content?.trim() || '{}';
    const parsed = JSON.parse(content);
    
    // Ensure we always have arrays
    if (!parsed.keywords || !Array.isArray(parsed.keywords)) {
      parsed.keywords = [query];
    }
    if (!parsed.categories) parsed.categories = [];
    if (!parsed.tags) parsed.tags = [];
    
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
      parsed: { 
        keywords: [query],
        categories: [],
        tags: [],
        price_min: null,
        price_max: null,
        confidence: 0.5
      },
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
    // Create OR conditions for each keyword
    const keywordConditions = filters.keywords.map((keyword: string) => {
      const likePattern = `%${keyword}%`;
      params.push(keyword, likePattern);
      const tsIdx = paramIndex;
      const likeIdx = paramIndex + 1;
      paramIndex += 2;
      
      return `(
        search_vector @@ plainto_tsquery('dutch', $${tsIdx})
        OR LOWER(title) LIKE LOWER($${likeIdx})
        OR LOWER(content) LIKE LOWER($${likeIdx})
      )`;
    }).join(' OR ');
    
    conditions.push(`(${keywordConditions})`);
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

  // Categories - STRICT type filtering
  // If AI detects a product type category, use it as a hard filter
  if (filters.categories && filters.categories.length > 0) {
    const typeCategories = ['Schilderijen', 'Schalen', 'Vazen', 'Wandborden', 'Beelden'];
    const detectedType = filters.categories.find((cat: string) => 
      typeCategories.some(type => cat.includes(type))
    );
    
    if (detectedType) {
      // Map to actual database category name
      let categoryPattern = '';
      if (detectedType.includes('Schilderij')) {
        categoryPattern = '%Schilderij%';
      } else if (detectedType.includes('Vazen') || detectedType.includes('Schalen')) {
        categoryPattern = '%Schalen & Vazen%';
      } else if (detectedType.includes('Wandbord')) {
        categoryPattern = '%Wandbord%';
      } else if (detectedType.includes('Beeld')) {
        categoryPattern = '%beeld%'; // lowercase for all beeld variations
      }
      
      if (categoryPattern) {
        params.push(categoryPattern);
        conditions.push(`id IN (
          SELECT product_id FROM product_categories 
          WHERE category_id IN (
            SELECT id FROM categories WHERE title ILIKE $${paramIndex}
          )
        )`);
        paramIndex++;
      }
    }
  }

  return { conditions, params };
}

// Search products with smart ranking
async function searchProducts(filters: any, limit: number, offset: number) {
  const { conditions, params } = buildSearchQuery(filters);
  
  const whereClause = conditions.join(' AND ');
  
  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`;
  const countResult = await sql.query(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0');

  // Simple, clean sorting - just by price
  const searchQuery = `
    SELECT id, title, full_title, content, brand, price, image, url
    FROM products
    WHERE ${whereClause}
    ORDER BY price ASC
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
