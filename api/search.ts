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
  
  const prompt = `Parse Dutch product search query. Extract: type, keywords, price range.

Query: "${query}"

Product types: Beeld, Schilderij, Vaas, Mok, Onderzetter, Theelicht, Spiegeldoosje, Wandbord, Schaal, Glasobject

Rules:
1. TYPE: Set ONLY if explicitly mentioned ("beeldje"→"Beeld", "schilderij"→"Schilderij")
2. KEYWORDS: Generate 16-48 related terms with ALL variations:
   - Singular, plural, diminutives (hond/honden/hondje)
   - Gender variants (sporter/sportster, atleet/atlete)
   - Compound words (voetbal → voetballer/voetbalster/voetbalwedstrijd)
   - Related concepts & synonyms
   - English equivalents when relevant
   - Use FULL PHRASES for multi-word concepts ("romeinse goden" not "god")
3. PRICE: Parse ranges ("onder 50"→max:50, "rond 40"→min:32,max:48)

Special cases:
- "cadeau" is NOT a type (type:null, extract theme keywords)
- Questions ("zijn er romeinse goden?") → extract subject keywords
- Mythology: use phrases ("romeinse goden" not "god" to avoid false matches)

Examples:
"beeldje" → {"type":"Beeld","keywords":[]}
"schilderij max 300" → {"type":"Schilderij","keywords":[],"price_max":300}
"hond" → {"type":null,"keywords":["hond","honden","hondje","hondjes","dog","dogs","puppy","puppies","huisdier","huisdieren","trouwe vriend"]}
"beeldje met hart" → {"type":"Beeld","keywords":["hart","harte","hartje","hartjes","heart","hearts","liefde","love","romance","romantisch","romantiek","valentijn","affectie","genegenheid"]}
"romeinse goden" → {"type":null,"keywords":["romeinse goden","romeins","rome","romeinen","mythologie","mythologisch","god","goden","godin","godinnen","jupiter","mars","venus"]}
"beeld voor sporter" → {"type":"Beeld","keywords":["sport","sporten","sporter","sportster","sportief","sportieve","atleet","atlete","atleten","voetbal","voetballen","voetballer","voetbalster","soccer","football","tennis","tennissen","tennisser","tennister","golf","golfen","golfer","golfster","hardlopen","hardloper","hardloopster","rennen","runner","marathon","marathonloper","darten","darter","darts","schaatsen","schaatser","schaatsster","judo","judoka","volleybal","volleyballen","volleyballer","volleybalster","fietsen","wielrennen","fietser","wielrenner","cyclist","biker"]}

Only return valid JSON, no explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',  // Upgraded from gpt-4o-mini for better intelligence
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 800,  // Increased for 16-48 keywords (was 500)
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content?.trim() || '{}';
    const parsed = JSON.parse(content);
    
    // Ensure we always have keywords array
    if (!parsed.keywords || !Array.isArray(parsed.keywords)) {
      parsed.keywords = [query];
    }
    
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

  // Keywords - ONLY full-text search (whole words only, no substrings)
  // This prevents false matches like "god" matching "goddelijke" or "godfather"
  if (filters.keywords && filters.keywords.length > 0) {
    const keywordConditions = filters.keywords.map((keyword: string) => {
      params.push(keyword);
      const idx = paramIndex++;
      
      // Use phrase search for multi-word keywords, plain search for single words
      if (keyword.includes(' ')) {
        return `search_vector @@ phraseto_tsquery('dutch', $${idx})`;
      } else {
        return `search_vector @@ plainto_tsquery('dutch', $${idx})`;
      }
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

// Search products with full-text search
async function searchProducts(filters: any, limit: number, offset: number) {
  const { conditions, params } = buildSearchQuery(filters);
  
  const whereClause = conditions.join(' AND ');
  
  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`;
  const countResult = await sql.query(countQuery, params);
  const total = parseInt(countResult.rows[0]?.total || '0');

  // Sort by popularity (stock_sold) and then price
  let orderBy = 'stock_sold DESC NULLS LAST, price ASC';
  
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

    // Parse query with AI (always - no pre-filtering)
    // AI understands intent, extracts filters (type, price, keywords)
    console.log('[Search] Parsing query with AI...');
    const queryData = await parseQuery(query);
    
    // Search database with parsed filters
    const results = await searchProducts(queryData.parsed, limit, offset);

    // Generate friendly advice message
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
