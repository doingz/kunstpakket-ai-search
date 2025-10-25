export const maxDuration = 30;

import { sql } from '@vercel/postgres';

export default async function handler(req: Request) {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {}
  };
  
  try {
    // Test 1: Database connection
    const start1 = Date.now();
    const test1 = await sql`SELECT 1 as test`;
    results.tests.database_connection = {
      status: 'ok',
      took_ms: Date.now() - start1
    };
    
    // Test 2: Products count
    const start2 = Date.now();
    const test2 = await sql`SELECT COUNT(*) as total FROM products WHERE is_visible = true`;
    results.tests.products_count = {
      status: 'ok',
      count: test2.rows[0].total,
      took_ms: Date.now() - start2
    };
    
    // Test 3: Embeddings count
    const start3 = Date.now();
    const test3 = await sql`SELECT COUNT(*) as total FROM products WHERE embedding IS NOT NULL`;
    results.tests.embeddings_count = {
      status: 'ok',
      count: test3.rows[0].total,
      took_ms: Date.now() - start3
    };
    
    //Test 4: Simple vector query
    const start4 = Date.now();
    const dummy = Array(1536).fill(0.1);
    const test4 = await sql.query(`
      SELECT id, title 
      FROM products 
      WHERE is_visible = true AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 5
    `, [JSON.stringify(dummy)]);
    results.tests.vector_query = {
      status: 'ok',
      results: test4.rows.length,
      took_ms: Date.now() - start4
    };
    
    results.overall = 'success';
    
  } catch (error: any) {
    results.overall = 'error';
    results.error = error.message;
  }
  
  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

