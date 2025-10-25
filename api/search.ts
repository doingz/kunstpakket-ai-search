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

// Simplified AI parsing - extract filters only
async function parseQuery(query: string) {
  const start = Date.now();
  
  const prompt = `Extract filters from Dutch search query. Return JSON only.

Query: "${query}"

Extract:
- type: exact product type (Beeld|Schilderij|Vaas|Mok|Onderzetter|Theelicht|Spiegeldoosje|Wandbord|Schaal|Glasobject) or null
- price_min: minimum price in euros or null
- price_max: maximum price in euros or null
- semantic_query: the rest (theme, style, subject, mood) for semantic search

Examples:
"modern schilderij onder 300" → {"type":"Schilderij","price_max":300,"semantic_query":"modern"}
"leuk cadeau" → {"type":null,"price_min":null,"price_max":null,"semantic_query":"leuk cadeau"}
"van gogh vaas" → {"type":"Vaas","price_min":null,"price_max":null,"semantic_query":"van gogh"}
"beeldje met voetballer" → {"type":"Beeld","price_min":null,"price_max":null,"semantic_query":"voetballer"}

Return JSON only.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',  // Cheaper model for simpler task
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      original: query,
      parsed,
      took_ms: Date.now() - start
    };
  } catch (error) {
    console.error('AI parse error:', error);
    return {
      original: query,
      parsed: { 
        type: null,
        price_min: null,
        price_max: null,
        semantic_query: query
      },
      took_ms: Date.now() - start
    };
  }
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

// Generate advice message
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

    // Parse query (extract filters)
    const parsed = await parseQuery(query);
    
    // Vector search with filters
    const searchResults = await vectorSearch({
      ...parsed.parsed,
      original: query
    });
    
    // Generate advice (with timeout fallback)
    const advicePromise = generateAdvice(query, {
      total: searchResults.total,
      showing: searchResults.items.length
    });
    
    const timeoutPromise = new Promise<string>((resolve) => 
      setTimeout(() => resolve(`Er zijn ${searchResults.total} producten gevonden!`), 2000)
    );
    
    const advice = await Promise.race([advicePromise, timeoutPromise]);

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
