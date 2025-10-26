#!/usr/bin/env node
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL);

async function checkKokeshi() {
  console.log('🔍 Checking Kokeshi products...\n');
  
  // Check by artist field
  const byArtist = await sql`
    SELECT id, title, artist, type, is_visible
    FROM products 
    WHERE artist ILIKE '%kokeshi%'
    LIMIT 10
  `;
  console.log('By artist field:', byArtist.length);
  byArtist.forEach(p => console.log(`  - ${p.title} (artist: ${p.artist}, type: ${p.type}, visible: ${p.is_visible})`));
  
  // Check by title
  const byTitle = await sql`
    SELECT id, title, artist, type, is_visible
    FROM products 
    WHERE title ILIKE '%kokeshi%'
    LIMIT 10
  `;
  console.log('\nBy title:', byTitle.length);
  byTitle.forEach(p => console.log(`  - ${p.title} (artist: ${p.artist}, type: ${p.type}, visible: ${p.is_visible})`));
  
  // Check brand in brands.json
  console.log('\nChecking brands.json for Kokeshi...');
  const fs = await import('fs');
  const brands = JSON.parse(fs.readFileSync('data/brands.json', 'utf-8'));
  const kokeshiBrand = brands.find(b => b.title.toLowerCase().includes('kokeshi'));
  console.log('Kokeshi brand:', kokeshiBrand);
  
  await sql.end();
}

checkKokeshi().catch(console.error);

