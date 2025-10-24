import { sql } from '@vercel/postgres';
import { config } from 'dotenv';

// Load environment variables
config();

async function clearDatabase() {
  console.log('🗑️  Clearing database...\n');
  
  try {
    // Delete in correct order (respecting foreign keys)
    console.log('Deleting product_tags...');
    const pt = await sql`DELETE FROM product_tags`;
    console.log(`✅ Cleared ${pt.rowCount} product_tags`);
    
    console.log('Deleting product_categories...');
    const pc = await sql`DELETE FROM product_categories`;
    console.log(`✅ Cleared ${pc.rowCount} product_categories`);
    
    console.log('Deleting variants...');
    const v = await sql`DELETE FROM variants`;
    console.log(`✅ Cleared ${v.rowCount} variants`);
    
    console.log('Deleting products...');
    const p = await sql`DELETE FROM products`;
    console.log(`✅ Cleared ${p.rowCount} products`);
    
    console.log('Deleting tags...');
    const t = await sql`DELETE FROM tags`;
    console.log(`✅ Cleared ${t.rowCount} tags`);
    
    console.log('Deleting categories...');
    const c = await sql`DELETE FROM categories`;
    console.log(`✅ Cleared ${c.rowCount} categories`);
    
    console.log('\n✅ Database cleared successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
  process.exit(0);
}

clearDatabase();

