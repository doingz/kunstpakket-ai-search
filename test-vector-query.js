import 'dotenv/config';
import { sql } from '@vercel/postgres';

async function test() {
  console.time('Vector query');
  
  // Test with dummy embedding
  const testEmbedding = Array(1536).fill(0.1);
  
  try {
    const query = `
      SELECT id, title, price
      FROM products
      WHERE is_visible = true
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 10
    `;
    
    const result = await sql.query(query, [JSON.stringify(testEmbedding)]);
    
    console.timeEnd('Vector query');
    console.log('Results:', result.rows.length);
    console.log('First result:', result.rows[0]?.title);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}

test();

