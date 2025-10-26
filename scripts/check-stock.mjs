#!/usr/bin/env node
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL);

async function checkStock() {
  console.log('📦 Checking stock fields...\n');
  
  const result = await sql`
    SELECT 
      id, title, stock, stock_sold,
      CASE WHEN stock_sold >= 10 THEN true ELSE false END as is_popular,
      CASE WHEN stock IS NOT NULL AND stock <= 5 AND stock > 0 THEN true ELSE false END as is_scarce
    FROM products 
    WHERE is_visible = true
    ORDER BY stock_sold DESC NULLS LAST
    LIMIT 10
  `;
  
  console.log('Top 10 by sales:');
  result.forEach(p => {
    console.log(`  ${p.title.substring(0, 50).padEnd(50)} | stock: ${String(p.stock).padStart(4)} | sold: ${String(p.stock_sold).padStart(3)} | popular: ${p.is_popular} | scarce: ${p.is_scarce}`);
  });
  
  // Check scarce products
  const scarce = await sql`
    SELECT id, title, stock, stock_sold
    FROM products 
    WHERE is_visible = true 
    AND stock IS NOT NULL 
    AND stock <= 5 
    AND stock > 0
    LIMIT 10
  `;
  
  console.log(`\n🔥 Scarce products (stock <= 5): ${scarce.length}`);
  scarce.forEach(p => {
    console.log(`  ${p.title.substring(0, 50)} | stock: ${p.stock}`);
  });
  
  await sql.end();
}

checkStock().catch(console.error);

