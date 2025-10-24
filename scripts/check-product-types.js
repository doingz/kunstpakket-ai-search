/**
 * Check product types in database
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function checkTypes() {
  // Check the products that were returned for "schilderij onder 300 euro"
  const productIds = [120539868, 147962622, 142039404, 150118775, 149974163];
  
  console.log('🔍 Checking product types...\n');
  
  for (const id of productIds) {
    const result = await sql`
      SELECT id, title, type, price
      FROM products 
      WHERE id = ${id}
    `;
    
    if (result.length > 0) {
      const product = result[0];
      console.log(`ID: ${product.id}`);
      console.log(`Title: ${product.title}`);
      console.log(`Type: ${product.type}`);
      console.log(`Price: €${product.price}`);
      console.log('---');
    }
  }
  
  // Count products by type
  console.log('\n📊 Products by type:');
  const counts = await sql`
    SELECT type, COUNT(*) as count
    FROM products
    WHERE is_visible = true
    GROUP BY type
    ORDER BY count DESC
  `;
  
  counts.forEach(row => {
    console.log(`${row.type || 'NULL'}: ${row.count}`);
  });
}

checkTypes().catch(console.error);

