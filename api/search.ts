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
- Onderzetter (coasters)
- Theelicht (tea lights, candle holders)
- Spiegeldoosje (compact mirrors)
- Wandbord (decorative plates)
- Schaal (bowls)
- Glasobject (glass art, crystal)

IMPORTANT: "Cadeau" is NOT a product type! If user searches for "cadeau", set type: null and search broadly.

⚠️ CRITICAL: DETECT NON-SHOPPING QUERIES!
If user asks an INFORMATIONAL QUESTION (not looking for products), extract the SUBJECT keywords anyway:
- "zijn er romeinse goden?" → keywords: ["romeinse goden", "romeinse god", "romeins", "rome", "mythologie"]
- "wat is een boeddha?" → keywords: ["boeddha", "buddha", "boeddhisme"]  
- "wie is picasso?" → keywords: ["picasso", "pablo picasso"]
Even for questions, extract subject keywords so we can find RELATED products (if any exist).

IMPORTANT for mythology/religion queries:
- Use FULL PHRASES like "romeinse goden", "griekse goden" (not just "god" or "goden")
- Avoid generic words that match too broadly ("god" matches "godin", "godfather", etc.)
- Be specific: "romeinse mythologie", "griekse godin", "egyptische god"

CRITICAL INSTRUCTIONS:
1. **Detect product type** - ONLY if user explicitly mentions the product type:
   - "schilderij", "painting", "giclee", "print" → type: "Schilderij"
   - "beeld", "beeldje", "sculpture" → type: "Beeld"  
   - "vaas", "vase" → type: "Vaas"
   - "mok", "cup", "mug" → type: "Mok"
   - "wandbord", "plate" → type: "Wandbord"
   - "schaal", "bowl" → type: "Schaal"
   - IMPORTANT: "een varken" = NO TYPE! Just search for varken (could be beeld, mok, etc.)
   - IMPORTANT: "een beeld" = type: "Beeld" (explicit product type)
   - IMPORTANT: "beeld voor X" = user wants a BEELD (not cadeau!)
   - ONLY set type when user explicitly searches for that product type!

2. **Extract theme/subject keywords** - Be PRECISE, not broad:
   - For simple subjects (animals, objects): ONLY direct term + plural + diminutives + English
     * "varken" → ["varken", "varkens", "varkentje", "varkentjes", "pig", "pigs"]
     * "hond" → ["hond", "honden", "hondje", "hondjes", "dog", "dogs"]
     * "kat" → ["kat", "katten", "katje", "katjes", "cat", "cats"]
     * NO generic terms like "dier", "farm", "animal"!
   - For professions: add related concepts + symbols
     * "advocaat" → ["advocaat", "justitie", "rechter", "law", "lawyer", "juridisch"]
     * "arts" → ["arts", "dokter", "doctor", "medisch", "medical", "hippocrates"]
     * "leraar" → ["leraar", "teacher", "onderwijs", "school", "uil", "owl", "boek", "book"]
   - IMPORTANT: Don't add generic terms like "dier", "animal" unless user asks for them!
   - Keep it focused: 6 keywords for simple subjects (term+plural+diminutives+English), 6-10 for professions

3. **Extract tags** (ONLY from available tags list!) for specific attributes:
   - Tags are ONLY for specific themes/attributes (hart, voetbal, etc.)
   - NEVER add the product type as a tag (e.g. "beeld", "schilderij")
   - If user searches "beeld" → set type: "Beeld", tags: [] (EMPTY!)
   - If user searches "beeldje met hart" → type: "Beeld", tags: ["hart", "hartje", ...]
   - Tags are STRICT filters, keywords are BROAD search

4. Parse price ranges intelligently:
   - "max 80 euro", "onder 50" → price_max
   - "vanaf 100", "boven 50" → price_min
   - "tussen 30 en 100", "30-100 euro" → price_min + price_max
   - "rond 50", "ongeveer 40", "om en nabij 60" → price_min = X * 0.8, price_max = X * 1.2

Return JSON with:
- type: ONE product type from the list above (Beeld, Schilderij, Vaas, Mok, Onderzetter, Theelicht, Spiegeldoosje, Wandbord, Schaal, Glasobject) or null
- keywords: array of search terms for SUBJECTS/THEMES (not product types!)
- tags: array of specific attributes with synonyms (ONLY from available tags list!)
- price_min: number or null
- price_max: number or null
- confidence: 0.0-1.0

REMEMBER: "Cadeau" is NOT a type! For "cadeau voor X", set type: null and add theme keywords.

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
Output: {"type":null,"keywords":["hond","honden","hondje","hondjes","dog","dogs"],"tags":[],"price_min":null,"price_max":null,"confidence":0.85}

Input: "varken"
Output: {"type":null,"keywords":["varken","varkens","varkentje","varkentjes","pig","pigs"],"tags":[],"price_min":null,"price_max":null,"confidence":0.85}

Input: "schilderij max 300 euro"
Output: {"type":"Schilderij","keywords":[],"tags":[],"price_min":null,"price_max":300,"confidence":0.95}

Input: "beeld voor een advocaat"
Output: {"type":"Beeld","keywords":["advocaat","justitie","rechter","law","lawyer","juridisch"],"tags":[],"price_min":null,"price_max":null,"confidence":0.9}

Input: "een beeld voor een docent"
Output: {"type":"Beeld","keywords":["docent","leraar","teacher","onderwijs","education","school","kennis"],"tags":[],"price_min":null,"price_max":null,"confidence":0.9}

Input: "zijn er romeinse goden?"
Output: {"type":null,"keywords":["romeinse","romeins","rome","roman","god","goden","gods","mythology","mythologie"],"tags":[],"price_min":null,"price_max":null,"confidence":0.7}

Input: "wat is boeddha?"
Output: {"type":null,"keywords":["boeddha","buddha","buddhism","boeddhisme","zen"],"tags":[],"price_min":null,"price_max":null,"confidence":0.7}

Input: "cadeau voor arts"
Output: {"type":null,"keywords":["arts","dokter","doctor","medisch","medical"],"tags":[],"price_min":null,"price_max":null,"confidence":0.9}

Input: "een cadeau voor een verjaardag"
Output: {"type":null,"keywords":["verjaardag","birthday","feest","celebration","party"],"tags":[],"price_min":null,"price_max":null,"confidence":0.85}

BAD Examples (DO NOT DO THIS):
Input: "schilderij"
Output: {"keywords":["schilderij","vaas","schaal","beeld"],...}
^ WRONG - vaas and schaal are NOT synonyms for schilderij!

Input: "beeld"
Output: {"type":"Beeld","tags":["beeld","beeldje"],...}
^ WRONG - NEVER add product type to tags! Tags should be EMPTY for simple type searches.

Input: "een beeld voor een docent"
Output: {"type":"Cadeau","tags":["cadeau"],...}
^ WRONG - user wants a BEELD, not generic cadeau! Type must be "Beeld".

Input: "vaas"
Output: {"keywords":["vaas","vazen","schaal","schalen","bowl"],...}
^ WRONG - schaal is different from vaas, don't mix them!

Input: "cadeau voor verjaardag"
Output: {"type":"Cadeau","tags":["cadeau"],...}
^ WRONG - "Cadeau" is NOT a type! Set type: null and search broadly with theme keywords.

Only return valid JSON, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',  // Upgraded from gpt-4o-mini for better intelligence
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
  // Uses multiple matching strategies:
  // 1. Exact phrase match in title (highest priority)
  // 2. Full-text search (handles word variations)
  // 3. Partial match with LIKE (handles substrings)
  // 4. Trigram similarity (handles typos/misspellings)
  if (filters.keywords && filters.keywords.length > 0) {
    const keywordConditions = filters.keywords.map((keyword: string) => {
      const likePattern = `%${keyword}%`;
      params.push(keyword, likePattern, keyword);
      const tsIdx = paramIndex;
      const likeIdx = paramIndex + 1;
      const trigramIdx = paramIndex + 2;
      paramIndex += 3;
      
      return `(
        search_vector @@ plainto_tsquery('dutch', $${tsIdx})
        OR LOWER(title) LIKE LOWER($${likeIdx})
        OR LOWER(content) LIKE LOWER($${likeIdx})
        OR similarity(LOWER(title), LOWER($${trigramIdx})) > 0.3
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

// Search products with smart ranking
async function searchProducts(filters: any, limit: number, offset: number) {
  const { conditions, params } = buildSearchQuery(filters);
  
  const whereClause = conditions.join(' AND ');
  
  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`;
  const countResult = await sql.query(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0');

  // Sort by relevance (best match first)
  // Priority: exact match > partial match > similarity > popularity
  let orderBy = 'stock_sold DESC NULLS LAST, price ASC';  // Default: popularity + price
  
  // Build relevance scoring
  const scoreParts: string[] = [];
  
  // Highest priority: tag matches in title
  if (filters.tags && filters.tags.length > 0) {
    const tagChecks = filters.tags.slice(0, 3).map((tag: string) => 
      `LOWER(title) LIKE LOWER('%${tag}%')`
    ).join(' OR ');
    scoreParts.push(`CASE WHEN ${tagChecks} THEN 1 ELSE 10 END`);
  }
  
  // Secondary: keyword relevance with similarity scoring
  if (filters.keywords && filters.keywords.length > 0) {
    const firstKeyword = filters.keywords[0];
    scoreParts.push(`
      CASE 
        WHEN LOWER(title) = LOWER('${firstKeyword}') THEN 1
        WHEN title ILIKE '${firstKeyword}%' THEN 2
        WHEN title ILIKE '%${firstKeyword}%' THEN 3
        WHEN similarity(LOWER(title), LOWER('${firstKeyword}')) > 0.5 THEN 4
        WHEN similarity(LOWER(title), LOWER('${firstKeyword}')) > 0.3 THEN 5
        ELSE 6
      END
    `);
  }
  
  if (scoreParts.length > 0) {
    orderBy = `${scoreParts.join(' + ')} ASC, stock_sold DESC NULLS LAST, price ASC`;
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
    items: results.rows.map((row: any) => ({
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
