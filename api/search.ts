/**
 * Vector Search API with pgvector
 * Semantic search using OpenAI embeddings + SQL filters for price/type
 */
import { sql } from '@vercel/postgres';
import OpenAI from 'openai';

// Vercel Serverless Function configuration
export const maxDuration = 30; // 30 seconds timeout
export const dynamic = 'force-dynamic'; // Disable caching

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Simple regex-based parsing - fast, no AI needed
function parseQuery(query: string) {
  const start = Date.now();
  const lowerQuery = query.toLowerCase();
  
  // Extract type
  let type = null;
  const types = ['beeld', 'schilderij', 'vaas', 'mok', 'onderzetter', 'theelicht', 'spiegeldoosje', 'wandbord', 'schaal', 'glasobject'];
  for (const t of types) {
    if (lowerQuery.includes(t)) {
      type = t.charAt(0).toUpperCase() + t.slice(1);
      break;
    }
  }
  
  // Extract price
  let price_min = null;
  let price_max = null;
  
  // "onder X euro" or "maximaal X"
  const maxMatch = lowerQuery.match(/(?:onder|max(?:imaal)?|tot)\s+(\d+)/);
  if (maxMatch) {
    price_max = parseInt(maxMatch[1]);
  }
  
  // "vanaf X euro" or "minimaal X"
  const minMatch = lowerQuery.match(/(?:vanaf|min(?:imaal)?|boven)\s+(\d+)/);
  if (minMatch) {
    price_min = parseInt(minMatch[1]);
  }
  
  // "tussen X en Y"
  const rangeMatch = lowerQuery.match(/tussen\s+(\d+)\s+en\s+(\d+)/);
  if (rangeMatch) {
    price_min = parseInt(rangeMatch[1]);
    price_max = parseInt(rangeMatch[2]);
  }
  
  return {
    original: query,
    parsed: {
      type,
      price_min,
      price_max,
      semantic_query: query
    },
    took_ms: Date.now() - start
  };
}

// Vector search with SQL filters
async function vectorSearch(filters: any) {
  const start = Date.now();
  
  // Generate query embedding
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: filters.semantic_query || filters.original,
    encoding_format: 'float'
  });
  
  const queryEmbedding = embeddingResponse.data[0].embedding;
  
  // Build SQL with filters + vector similarity
  const conditions = ['is_visible = true', 'embedding IS NOT NULL'];
  const params: any[] = [JSON.stringify(queryEmbedding)];
  let paramIndex = 2;
  
  if (filters.type) {
    params.push(filters.type);
    conditions.push(`type = $${paramIndex++}`);
  }
  
  if (filters.price_min) {
    params.push(filters.price_min);
    conditions.push(`price >= $${paramIndex++}`);
  }
  
  if (filters.price_max) {
    params.push(filters.price_max);
    conditions.push(`price <= $${paramIndex++}`);
  }
  
  const query = `
    SELECT 
      id, title, full_title, content, brand, price, old_price,
      stock, stock_sold as "salesCount", image, url,
      (embedding <=> $1::vector) as distance
    FROM products
    WHERE ${conditions.join(' AND ')}
    ORDER BY 
      embedding <=> $1::vector,
      stock_sold DESC NULLS LAST
    LIMIT 50
  `;
  
  const result = await sql.query(query, params);
  
  return {
    items: result.rows,
    total: result.rows.length,
    took_ms: Date.now() - start
  };
}

// Format product for response
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
    salesCount: row.salesCount || 0,
    image: row.image,
    url: row.url
  };
}

// Simple advice message - no AI needed
function generateAdvice(query: string, total: number) {
  if (total === 0) {
    return 'Helaas geen producten gevonden. Probeer een andere zoekopdracht.';
  }
  
  const emojis = ['🎨', '✨', '🎁', '💎', '🌟', '🖼️', '🎭'];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  
  if (total === 1) {
    return `${emoji} Er is 1 product gevonden dat past bij je zoekopdracht!`;
  } else if (total <= 5) {
    return `${emoji} Er zijn ${total} producten gevonden! Neem gerust de tijd om te bekijken.`;
  } else if (total <= 20) {
    return `${emoji} Ik heb ${total} mooie producten voor je gevonden! Hopelijk zit er iets tussen dat je zoekt.`;
  } else {
    return `${emoji} Er zijn ${total} producten gevonden die passen bij je zoekopdracht!`;
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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const queryStart = Date.now();

    // Parse query (fast, no AI)
    const parsed = parseQuery(query);
    
    // Vector search with filters (only 1 AI call: embedding)
    const searchResults = await vectorSearch({
      ...parsed.parsed,
      original: query
    });
    
    // Generate advice (fast, no AI)
    const advice = generateAdvice(query, searchResults.total);

    const response = {
      success: true,
      query: parsed,
      results: {
        total: searchResults.total,
        showing: searchResults.items.length,
        items: searchResults.items.map(formatProduct),
        advice
      },
      meta: {
        took_ms: Date.now() - queryStart
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
