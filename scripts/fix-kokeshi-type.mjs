#!/usr/bin/env node
/**
 * Fix Kokeshi product types from Overig to Beeld
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL);

async function fixKokeshi() {
  console.log('🔧 Fixing Kokeshi product types...\n');
  
  const result = await sql`
    UPDATE products 
    SET type = 'Beeld'
    WHERE (title ILIKE '%kokeshi%' OR artist ILIKE '%kokeshi%')
    AND type = 'Overig'
    RETURNING id, title, type
  `;
  
  console.log(`✅ Updated ${result.length} products:`);
  result.forEach(p => console.log(`   - ${p.title} → type: ${p.type}`));
  
  await sql.end();
}

fixKokeshi().catch(console.error);

