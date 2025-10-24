/**
 * Vercel Edge Function for AI Search
 */
import { sql } from '@vercel/postgres';
import OpenAI from 'openai';
import { getTagsPromptSection } from '../lib/available-tags.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Parse query with AI
async function parseQuery(query: string) {
  const start = Date.now();
  
  const tagsSection = await getTagsPromptSection();
  
  const prompt = `Parse this Dutch e-commerce search query for an art & gift webshop and extract structured filters.

Search query: "${query}"

${tagsSection}

Available product types (use for strict filtering):
- Beeld (sculptures, figurines, statues)
- Schilderij (paintings, prints, giclees, art on canvas)
- Vaas (vases)
- Mok (mugs, cups)
- Wandbord (decorative plates)
- Schaal (bowls)
- Glasobject (glass art, crystal)
- Cadeau (gifts)

CRITICAL INSTRUCTIONS:
1. **Detect product type** - if user searches for a product type, set it:
   - "schilderij", "painting", "giclee", "print" → type: "Schilderij"
   - "beeld", "beeldje", "sculpture" → type: "Beeld"  
   - "vaas", "vase" → type: "Vaas"
   - "mok", "cup", "mug" → type: "Mok"
   - "wandbord", "plate" → type: "Wandbord"
   - "schaal", "bowl" → type: "Schaal"
   - ONLY set type if user explicitly searches for it!

2. **Extract theme/subject keywords** for searches on subjects, themes, professions, occasions:
   - If user mentions a SUBJECT/THEME (not product type), add as keyword
   - Examples:
     * "beeld voor een advocaat" → keywords: ["advocaat", "justitie", "rechter", "law", "lawyer"]
     * "cadeau voor een arts" → keywords: ["arts", "dokter", "doctor", "medisch"]
     * "hond" → keywords: ["hond", "honden", "dog", "dogs"]
     * "voor moederdag" → keywords: ["moeder", "moederdag", "mother", "mama"]
   - Include Dutch + English synonyms
   - These will be used to search in title/description

3. **Extract tags** (ONLY from available tags list!) for specific attributes that exist in tags:
   - Check if theme/subject exists in available tags list
   - If "voetbal" exists in tags → use it
   - If "advocaat" does NOT exist in tags → use keywords instead
   - Tags are STRICT filters, keywords are BROAD search

4. Parse price ranges intelligently:
   - "max 80 euro", "onder 50" → price_max
   - "vanaf 100", "boven 50" → price_min
   - "tussen 30 en 100", "30-100 euro" → price_min + price_max
   - "rond 50", "ongeveer 40", "om en nabij 60" → price_min = X * 0.8, price_max = X * 1.2

Return JSON with:
- type: ONE product type from the list above (Beeld, Schilderij, Vaas, Mok, Wandbord, Schaal, Glasobject, Cadeau) or null
- keywords: array of search terms for SUBJECTS/THEMES (not product types!)
- tags: array of specific attributes with synonyms (ONLY from available tags list!)
- price_min: number or null
- price_max: number or null
- confidence: 0.0-1.0

GOOD Examples:

Input: "schilderij"
Output: {"type":"Schilderij","keywords":[],"tags":[],"price_min":null,"price_max":null,"confidence":0.95}

Input: "giclee"
Output: {"type":"Schilderij","keywords":[],"tags":[],"price_min":null,"price_max":null,"confidence":0.95}

Input: "beeldje"
Output: {"type":"Beeld","keywords":[],"tags":[],"price_min":null,"price_max":null,"confidence":0.95}

Input: "beeldje met hart max 80 euro"
Output: {"type":"Beeld","keywords":[],"tags":["hart","hartje","heart","hearts","love","liefde"],"price_min":null,"price_max":80,"confidence":0.95}

Input: "beeldje met een voetballer"
Output: {"type":"Beeld","keywords":[],"tags":["voetbal","voetballer","football","soccer"],"price_min":null,"price_max":null,"confidence":0.95}

Input: "hond"
Output: {"type":null,"keywords":["hond","honden","dog","dogs"],"tags":[],"price_min":null,"price_max":null,"confidence":0.85}

Input: "schilderij max 300 euro"
Output: {"type":"Schilderij","keywords":[],"tags":[],"price_min":null,"price_max":300,"confidence":0.95}

Input: "beeld voor een advocaat"
Output: {"type":"Beeld","keywords":["advocaat","justitie","rechter","law","lawyer","juridisch"],"tags":[],"price_min":null,"price_max":null,"confidence":0.9}

Input: "cadeau voor arts"
Output: {"type":"Cadeau","keywords":["arts","dokter","doctor","medisch","medical"],"tags":[],"price_min":null,"price_max":null,"confidence":0.9}

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
        type: null,
        keywords: [query],
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

  // Product type - STRICT filtering (enriched during sync)
  if (filters.type) {
    params.push(filters.type);
    conditions.push(`type = $${paramIndex}`);
    paramIndex++;
  }

  // Keywords - only for subject/theme search (NOT for product types!)
  if (filters.keywords && filters.keywords.length > 0) {
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

  // Tags - for specific attributes/themes
  if (filters.tags && filters.tags.length > 0) {
    params.push(filters.tags);
    conditions.push(`id IN (
      SELECT product_id FROM product_tags 
      WHERE tag_id IN (SELECT id FROM tags WHERE title = ANY($${paramIndex}))
    )`);
    paramIndex++;
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

  // Sort by relevance (best match first)
  // Priority: tag matches > keyword matches, title > content
  let orderBy = 'price ASC';  // Default fallback
  
  // Build relevance scoring
  const scoreParts: string[] = [];
  
  // Highest priority: tag matches in title
  if (filters.tags && filters.tags.length > 0) {
    const tagChecks = filters.tags.slice(0, 3).map((tag: string) => 
      `LOWER(title) LIKE LOWER('%${tag}%')`
    ).join(' OR ');
    scoreParts.push(`CASE WHEN ${tagChecks} THEN 1 ELSE 10 END`);
  }
  
  // Secondary: keyword matches in title
  if (filters.keywords && filters.keywords.length > 0) {
    const firstKeyword = filters.keywords[0];
    scoreParts.push(`
      CASE 
        WHEN LOWER(title) = LOWER('${firstKeyword}') THEN 1
        WHEN LOWER(title) LIKE LOWER('%${firstKeyword}%') THEN 2
        ELSE 3
      END
    `);
  }
  
  if (scoreParts.length > 0) {
    orderBy = `${scoreParts.join(' + ')} ASC, stock_sold DESC NULLS LAST, price ASC`;
  }
  
  const searchQuery = `
    SELECT id, title, full_title, content, brand, price, image, url
    FROM products
    WHERE ${whereClause}
    ORDER BY ${orderBy}
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
