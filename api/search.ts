/**
 * AI-powered semantic search with Vercel AI SDK + pgvector
 * Edge Runtime for fastest cold starts
 */
import { embed, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { sql } from '@vercel/postgres';
import { z } from 'zod';

export const runtime = 'edge';
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

// AI-powered filter extraction using generateObject
async function parseFilters(query: string) {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: z.object({
      priceMin: z.number().optional().describe('Minimum price in euros'),
      priceMax: z.number().optional().describe('Maximum price in euros'),
      categories: z.array(z.string()).optional().describe('Product categories like "geschenken", "kunst", "decoratie"')
    }),
    prompt: `Extract filters from this Dutch product search query: "${query}"

Examples:
- "schilderij onder 50 euro" → priceMax: 50
- "cadeau voor moeder niet te duur" → priceMax: 100, categories: ["geschenken"]
- "tussen 20 en 50 euro" → priceMin: 20, priceMax: 50
- "iets leuks" → (no filters)
- "Van Gogh" → (no filters, let embeddings handle it)

Return only the filters that are clearly mentioned. Be conservative with priceMax inference.`,
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

export default async function handler(req: Request) {
  // CORS
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

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const { query } = await req.json();
    
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Query required' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
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

    // TODO: Category filtering when needed
    // if (filters.categories?.length > 0) { ... }

    // Vector similarity search with SQL filters
    const queryText = `
      SELECT 
        id, title, full_title, description, url, price, old_price, image,
        1 - (embedding <=> $1::vector) as similarity
      FROM products
      WHERE ${whereClause}
      ORDER BY embedding <=> $1::vector, stock_sold DESC NULLS LAST
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

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error: any) {
    console.error('Search error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Search failed',
      details: error.message
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

