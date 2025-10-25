/**
 * AI-powered semantic search with Vercel AI SDK + pgvector
 * Node.js Serverless runtime
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { embed, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { sql } from '@vercel/postgres';
import { z } from 'zod';

// Explicit Node.js runtime
export const config = {
  runtime: 'nodejs',
  maxDuration: 30
};

// AI-powered filter extraction using generateObject
async function parseFilters(query: string) {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        priceMin: z.number().optional().nullable(),
        priceMax: z.number().optional().nullable(),
        productType: z.string().optional().nullable().describe('Product type: Schilderij, Beeld, Vaas, Mok, Schaal, Wandbord, Onderzetters, Theelichthouder, Keramiek'),
        keywords: z.array(z.string()).default([]).describe('Specific search terms (animals, artists, objects). Empty array if none.'),
        requiresExactMatch: z.boolean().default(false).describe('True if searching for specific things that MUST be in title/description')
      }),
      prompt: `Analyze this Dutch product search query and extract filters: "${query}"

Extract:
1. priceMin/priceMax: Concrete numbers ONLY. For "niet te duur", "goedkoop", "luxe" → return null (not enough info)
2. productType: ONLY if explicitly mentioned: Schilderij, Beeld, Vaas, Mok, Schaal, Wandbord, Onderzetters, Theelichthouder, Keramiek
3. keywords: Specific subjects (animals, artists, objects). Split artist names (e.g. "van gogh" → ["van gogh", "gogh"])
4. requiresExactMatch: true if keywords MUST appear in title/description

CRITICAL RULES:
- Extract productType if user mentions: schilderij, beeld/beeldje/sculptuur, vaas, mok, schaal, wandbord, onderzetters, theelicht, keramiek
- DO NOT add product types as keywords
- For artist names: extract both full name AND last name (e.g. "Van Gogh" → ["van gogh", "gogh"])
- For animals: add common synonyms (e.g. "kat" → ["kat", "poes"], "hond" → ["hond", "honden"])
- For occasions: use broader terms (e.g. "huwelijkscadeau" → ["huwelijk", "trouwen"], "bedankje" → ["bedanken", "dank"])
- For vague price terms ("niet te duur", "goedkoop", "luxe") → return null for price (semantic search will handle it)
- Use requiresExactMatch=false for generic searches, true only for very specific items (artists, specific objects)

Examples:
"kat" → {"keywords": ["kat", "poes"], "requiresExactMatch": false}
"poes" → {"keywords": ["kat", "poes"], "requiresExactMatch": false}
"hond" → {"keywords": ["hond", "honden"], "requiresExactMatch": false}
"Van Gogh schilderij" → {"productType": "Schilderij", "keywords": ["van gogh", "gogh"], "requiresExactMatch": true}
"een beeldje met een hond, max 80 euro" → {"priceMax": 80, "productType": "Beeld", "keywords": ["hond", "honden"], "requiresExactMatch": false}
"schilderij max 300 euro" → {"priceMax": 300, "productType": "Schilderij"}
"niet te duur" → {"priceMax": null}
"goedkoop cadeau" → {"priceMax": null}
"iets moois" → {}
"huwelijkscadeau" → {"keywords": ["huwelijk", "trouwen", "bruiloft"], "requiresExactMatch": false}
"bedankje" → {"keywords": ["bedanken", "dank", "thanks"], "requiresExactMatch": false}
"klassiek" → {"keywords": ["klassiek", "traditioneel", "vintage"], "requiresExactMatch": false}`,
    });

    return object;
  } catch (error: any) {
    console.error('parseFilters error:', error);
    // Fallback: return empty filters on AI failure
    return {
      priceMin: null,
      priceMax: null,
      productType: null,
      keywords: [],
      requiresExactMatch: false
    };
  }
}

// Format product for response
function formatProduct(row: any) {
  return {
    id: row.id,
    title: row.title,
    fullTitle: row.full_title,
    description: row.description,
    url: row.url,
    price: parseFloat(row.price),
    oldPrice: row.old_price ? parseFloat(row.old_price) : null,
    onSale: row.old_price && parseFloat(row.old_price) > parseFloat(row.price),
    discount: row.old_price 
      ? Math.round((1 - parseFloat(row.price) / parseFloat(row.old_price)) * 100) 
      : 0,
    image: row.image,
    similarity: row.similarity ? parseFloat(row.similarity) : null
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'Query required' 
      });
    }

    const start = Date.now();

    // Parallel: AI filter parsing + embedding generation (fastest!)
    const [filters, { embedding }] = await Promise.all([
      parseFilters(query),
      embed({
        model: openai.embedding('text-embedding-3-large'),
        value: query
      })
    ]);

    // Build WHERE clause with filters
    let whereClause = 'is_visible = true AND embedding IS NOT NULL';
    const params: any[] = [JSON.stringify(embedding)];
    let paramIndex = 2;

    if (filters.productType) {
      params.push(filters.productType);
      whereClause += ` AND type = $${paramIndex++}`;
    }

    if (filters.priceMax) {
      params.push(filters.priceMax);
      whereClause += ` AND price <= $${paramIndex++}`;
    }

    if (filters.priceMin) {
      params.push(filters.priceMin);
      whereClause += ` AND price >= $${paramIndex++}`;
    }

    // Add keyword filtering if keywords are provided
    if (filters.keywords && filters.keywords.length > 0) {
      const keywordConditions = filters.keywords.map(keyword => {
        params.push(`%${keyword}%`);
        return `(title ILIKE $${paramIndex++} OR description ILIKE $${paramIndex - 1})`;
      }).join(' OR ');
      
      whereClause += ` AND (${keywordConditions})`;
    }

    // Build ORDER BY clause - prioritize exact keyword matches
    let orderBy = 'embedding <=> $1::vector';
    
    if (filters.requiresExactMatch && filters.keywords && filters.keywords.length > 0) {
      // Calculate starting index for keyword parameters
      let keywordParamStartIndex = 2;
      if (filters.productType) keywordParamStartIndex++;
      if (filters.priceMax) keywordParamStartIndex++;
      if (filters.priceMin) keywordParamStartIndex++;
      
      // Boost products with keywords in title
      const keywordBoost = filters.keywords.map((_, idx) => 
        `CASE WHEN title ILIKE $${keywordParamStartIndex + idx} THEN 0 ELSE 1 END`
      ).join(' + ');
      
      orderBy = `(${keywordBoost}), ${orderBy}`;
    }
    
    orderBy += ', stock_sold DESC NULLS LAST';

    // Vector similarity search with SQL filters and keyword boosting
    const queryText = `
      SELECT 
        id, title, full_title, description, url, price, old_price, image,
        1 - (embedding <=> $1::vector) as similarity
      FROM products
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT 50
    `;

    let result = await sql.query(queryText, params);

    // Fallback: if 0 results with keywords, retry without keyword filter (semantic search only)
    if (result.rows.length === 0 && filters.keywords && filters.keywords.length > 0) {
      console.log('Fallback: 0 results with keywords, retrying without keyword filter');
      
      let fallbackWhereClause = 'is_visible = true AND embedding IS NOT NULL';
      const fallbackParams: any[] = [JSON.stringify(embedding)];
      let fallbackParamIndex = 2;
      
      if (filters.productType) {
        fallbackParams.push(filters.productType);
        fallbackWhereClause += ` AND type = $${fallbackParamIndex++}`;
      }
      
      if (filters.priceMax) {
        fallbackParams.push(filters.priceMax);
        fallbackWhereClause += ` AND price <= $${fallbackParamIndex++}`;
      }
      
      if (filters.priceMin) {
        fallbackParams.push(filters.priceMin);
        fallbackWhereClause += ` AND price >= $${fallbackParamIndex++}`;
      }
      
      const fallbackQuery = `
        SELECT 
          id, title, full_title, description, url, price, old_price, image, type,
          1 - (embedding <=> $1::vector) as similarity
        FROM products
        WHERE ${fallbackWhereClause}
        ORDER BY embedding <=> $1::vector, stock_sold DESC NULLS LAST
        LIMIT 50
      `;
      
      result = await sql.query(fallbackQuery, fallbackParams);
    }

    // Generate friendly advice message
    const total = result.rows.length;
    let advice = '';
    
    if (total === 0) {
      advice = 'Helaas geen producten gevonden. Probeer een andere zoekopdracht of minder specifieke filters.';
    } else if (total === 1) {
      advice = '✨ Er is 1 perfect product voor je gevonden!';
    } else if (total <= 5) {
      advice = `🎨 Ik heb ${total} mooie producten voor je gevonden!`;
    } else if (total <= 20) {
      advice = `✨ Er zijn ${total} prachtige producten die aan je wensen voldoen!`;
    } else {
      const emojis = ['🎨', '✨', '🎁', '💎', '🌟'];
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      advice = `${emoji} Ik heb ${total} producten gevonden! Bekijk ze allemaal en vind jouw favoriet.`;
    }

    const response = {
      success: true,
      query: {
        original: query,
        filters: filters,
        took_ms: Date.now() - start
      },
      results: {
        total: result.rows.length,
        showing: result.rows.length,
        items: result.rows.map(formatProduct),
        advice: advice
      }
    };

    return res.status(200).json(response);

  } catch (error: any) {
    console.error('Search error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      details: error.message
    });
  }
}
