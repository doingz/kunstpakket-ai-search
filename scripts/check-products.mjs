#!/usr/bin/env node
/**
 * Check products in database
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL);

async function checkProducts() {
  console.log('🔍 Checking products in database...\n');
  
  // Check mokken
  const mokken = await sql`
    SELECT COUNT(*), type 
    FROM products 
    WHERE type = 'Mok' AND is_visible = true
    GROUP BY type
  `;
  console.log('Mokken:', mokken);
  
  // Check products met "dog" in title/description
  const dogs = await sql`
    SELECT id, title, type
    FROM products 
    WHERE (title ILIKE '%dog%' OR description ILIKE '%dog%') 
    AND is_visible = true
    LIMIT 5
  `;
  console.log('\nProducts met "dog":', dogs.length);
  dogs.forEach(p => console.log(`  - ${p.title} (${p.type})`));
  
  // Check products met "hond" in title/description
  const honden = await sql`
    SELECT id, title, type
    FROM products 
    WHERE (title ILIKE '%hond%' OR description ILIKE '%hond%') 
    AND is_visible = true
    LIMIT 5
  `;
  console.log('\nProducts met "hond":', honden.length);
  honden.forEach(p => console.log(`  - ${p.title} (${p.type})`));
  
  // Check embeddings
  const noEmbedding = await sql`
    SELECT COUNT(*) as count
    FROM products 
    WHERE is_visible = true AND embedding IS NULL
  `;
  console.log('\nProducts zonder embedding:', noEmbedding[0].count);
  
  await sql.end();
}

checkProducts().catch(console.error);

