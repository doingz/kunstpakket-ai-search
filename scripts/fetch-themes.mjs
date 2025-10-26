#!/usr/bin/env node
/**
 * Fetch popular themes/keywords from product catalog and save to data/themes.json
 * Analyzes product titles and descriptions to find common themes
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing POSTGRES_URL in .env');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

// Common Dutch words to filter out (stopwords + generic terms)
const STOPWORDS = new Set([
  'de', 'het', 'een', 'in', 'op', 'van', 'voor', 'met', 'aan', 'dit', 'dat',
  'als', 'bij', 'tot', 'naar', 'uit', 'over', 'door', 'zijn', 'heeft', 'werd',
  'wordt', 'waar', 'niet', 'ook', 'maar', 'deze', 'dit', 'zijn', 'haar', 'hem',
  'beeld', 'beelden', 'beeldje', 'sculptuur', 'schilderij', 'vaas', 'mok',
  'product', 'producten', 'kunstpakket', 'cadeauverpakking', 'geschenkdoos',
  'incl', 'inclusief', 'verzending', 'verzenden', 'gratis', 'binnen', 'nederland',
  'cm', 'hoog', 'hoogte', 'circa', 'afmetingen', 'formaat', 'groot', 'klein',
  'mooi', 'mooie', 'fraai', 'fraaie', 'prachtig', 'prachtige', 'leuk', 'leuke',
  'ideaal', 'perfect', 'geschikt', 'cadeau', 'geschenk', 'tip', 'kado'
]);

async function fetchThemes() {
  console.log('🔍 Analyzing product catalog for popular themes...');
  
  try {
    // Fetch all product titles and descriptions
    const products = await sql`
      SELECT title, description
      FROM products
      WHERE is_visible = true
    `;
    
    console.log(`   Analyzing ${products.length} products...\n`);
    
    // Count word frequency
    const wordCounts = new Map();
    
    products.forEach(product => {
      const text = `${product.title} ${product.description || ''}`.toLowerCase();
      
      // Extract words (2+ characters, letters only)
      const words = text.match(/[a-zà-ÿ]{2,}/g) || [];
      
      words.forEach(word => {
        // Skip stopwords and very short words
        if (STOPWORDS.has(word) || word.length < 3) return;
        
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      });
    });
    
    // Sort by frequency and take top themes
    const sortedThemes = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([word, count]) => count >= 5) // At least 5 occurrences
      .slice(0, 100); // Top 100
    
    console.log('📊 Top 50 themes by frequency:\n');
    sortedThemes.slice(0, 50).forEach(([theme, count], index) => {
      console.log(`   ${(index + 1).toString().padStart(2)}. ${theme.padEnd(20)} (${count} occurrences)`);
    });
    
    // Save theme list (just the words)
    const themes = sortedThemes.map(([word]) => word);
    const outputPath = path.join(__dirname, '..', 'data', 'themes.json');
    fs.writeFileSync(outputPath, JSON.stringify(themes, null, 2));
    
    console.log(`\n💾 Saved ${themes.length} themes to: ${outputPath}`);
    
    return themes;
  } catch (error) {
    console.error('❌ Error fetching themes:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

async function main() {
  try {
    await fetchThemes();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

