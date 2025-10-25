/**
 * AI-powered search with Vercel AI SDK + pgvector
 * Clean, fast, production-ready
 */
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { sql } from '@vercel/postgres';

export const runtime = 'edge'; // Use Edge Runtime for faster cold starts
export const maxDuration = 25; // Edge functions max 25s
export const dynamic = 'force-dynamic';

// Simple regex parsing for type and price
function parseFilters(query: string) {
  const lowerQuery = query.toLowerCase();

  // Extract type
  let type: string | null = null;
  const types = ['beeld', 'schilderij', 'vaas', 'mok', 'onderzetter', 'theelicht', 'spiegeldoosje', 'wandbord', 'schaal', 'glasobject'];
  for (const t of types) {
    if (lowerQuery.includes(t)) {
      type = t.charAt(0).toUpperCase() + t.slice(1);
      break;
    }
  }

  // Extract price
  let price_min: number | null = null;
  let price_max: number | null = null;

  const maxMatch = lowerQuery.match(/(?:onder|max(?:imaal)?|tot)\s+(\d+)/);
  if (maxMatch) price_max = parseInt(maxMatch[1]);

  const minMatch = lowerQuery.match(/(?:vanaf|min(?:imaal)?|boven)\s+(\d+)/);
  if (minMatch) price_min = parseInt(minMatch[1]);

  const rangeMatch = lowerQuery.match(/tussen\s+(\d+)\s+en\s+(\d+)/);
  if (rangeMatch) {
    price_min = parseInt(rangeMatch[1]);
    price_max = parseInt(rangeMatch[2]);
  }

  return { type, price_min, price_max };
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
    salesCount: row.stock_sold || 0,
    image: row.image,
    url: row.url
  };
}

// Simple advice
function generateAdvice(total: number) {
  if (total === 0) return 'Helaas geen producten gevonden. Probeer een andere zoekopdracht.';
  const emoji = ['🎨', '✨', '🎁', '💎', '🌟'][Math.floor(Math.random() * 5)];
  if (total === 1) return `${emoji} Er is 1 product gevonden!`;
  if (total <= 5) return `${emoji} Er zijn ${total} producten gevonden!`;
  if (total <= 20) return `${emoji} Ik heb ${total} mooie producten voor je gevonden!`;
  return `${emoji} Er zijn ${total} producten gevonden!`;
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const { query: searchQuery } = await req.json();
    if (!searchQuery) {
      return new Response(JSON.stringify({ error: 'Query required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const start = Date.now();

    // Parse filters (fast, no AI)
    const filters = parseFilters(searchQuery);
    
    // Generate embedding with AI SDK (one API call)
    const { embedding } = await embed({
      model: openai.textEmbeddingModel('text-embedding-3-small'),
      value: searchQuery
    });
    
    // Build WHERE clause as string
    let whereClause = 'is_visible = true AND embedding IS NOT NULL';
    const sqlParams: any[] = [JSON.stringify(embedding)];
    let paramIndex = 2;

    if (filters.type) {
      whereClause += ` AND type = $${paramIndex++}`;
      sqlParams.push(filters.type);
    }

    if (filters.price_min) {
      whereClause += ` AND price >= $${paramIndex++}`;
      sqlParams.push(filters.price_min);
    }

    if (filters.price_max) {
      whereClause += ` AND price <= $${paramIndex++}`;
      sqlParams.push(filters.price_max);
    }

    // Vector search with sql template literal (Edge Runtime compatible)
    const queryText = `
      SELECT
        id, title, full_title, content, brand, price, old_price,
        stock_sold, image, url
      FROM products
      WHERE ${whereClause}
      ORDER BY embedding <=> $1::vector, stock_sold DESC NULLS LAST
      LIMIT 50
    `;

    const result = await sql.query(queryText, sqlParams);
    
    const response = {
      success: true,
      query: {
        original: searchQuery,
        parsed: filters,
        took_ms: Date.now() - start
      },
      results: {
        total: result.rows.length,
        showing: result.rows.length,
        items: result.rows.map(formatProduct),
        advice: generateAdvice(result.rows.length)
      },
      meta: {
        took_ms: Date.now() - start
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error: any) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Search failed',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
