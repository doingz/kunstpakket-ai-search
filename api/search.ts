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
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: z.object({
      priceMin: z.number().optional(),
      priceMax: z.number().optional(),
      categories: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional().describe('Specific subjects, animals, artists, or objects mentioned'),
      requiresExactMatch: z.boolean().optional().describe('True if query is about specific things that need keyword matching')
    }),
    prompt: `Extract filters and keywords from this Dutch product search query: "${query}"

IMPORTANT RULES:
1. Extract specific subjects as keywords (animals, artists, names, objects)
2. Set requiresExactMatch=true if user searches for SPECIFIC things (not vague queries)
3. Keywords should be Dutch words that appear in product titles/descriptions

Examples:
- "een beeldje met een hond, max 80 euro" → {priceMax: 80, keywords: ["hond"], requiresExactMatch: true}
- "kat onder 50 euro" → {priceMax: 50, keywords: ["kat"], requiresExactMatch: true}
- "Van Gogh schilderij" → {keywords: ["van gogh", "gogh"], requiresExactMatch: true}
- "cadeau voor moeder" → {keywords: ["moeder", "cadeau"], requiresExactMatch: false}
- "iets moois voor woonkamer" → {requiresExactMatch: false}
- "kunst tussen 20 en 50 euro" → {priceMin: 20, priceMax: 50, requiresExactMatch: false}

Return empty arrays/false if not applicable.`,
  });
  
  return object;
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
        model: openai.embedding('text-embedding-3-small'),
        value: query
      })
    ]);

    // Build WHERE clause with filters
    let whereClause = 'is_visible = true AND embedding IS NOT NULL';
    const params: any[] = [JSON.stringify(embedding)];
    let paramIndex = 2;

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
      // Boost products with keywords in title
      const keywordBoost = filters.keywords.map((_, idx) => 
        `CASE WHEN title ILIKE $${2 + (filters.priceMax ? 1 : 0) + (filters.priceMin ? 1 : 0) + idx} THEN 0 ELSE 1 END`
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

    const result = await sql.query(queryText, params);

    const response = {
      success: true,
      query: {
        original: query,
        filters: filters,
        took_ms: Date.now() - start
      },
      results: {
        total: result.rows.length,
        items: result.rows.map(formatProduct)
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
