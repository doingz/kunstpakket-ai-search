/**
 * Extract meaningful keywords from product titles and descriptions
 * to create a comprehensive tag list for AI search
 */
import { sql } from '@vercel/postgres';
import 'dotenv/config';

// Dutch stopwords to filter out
const STOPWORDS = new Set([
  'de', 'het', 'een', 'en', 'van', 'in', 'op', 'met', 'voor', 'aan', 'uit', 'naar', 
  'te', 'om', 'bij', 'tot', 'door', 'over', 'dat', 'deze', 'die', 'dit', 'als',
  'zijn', 'was', 'heeft', 'had', 'kan', 'mag', 'moet', 'wordt', 'werd',
  'ook', 'maar', 'of', 'want', 'dus', 'niet', 'meer', 'wel', 'zeer', 'nog',
  'incl', 'inclusief', 'verzending', 'verzenden', 'verzendkosten', 'geschenkdoos', 
  'geschenkverpakking', 'cadeauverpakking', 'stuks', 'hoog', 'klein', 'groot',
  'after', 'copy'
]);

// Minimum word length
const MIN_LENGTH = 4;

// Minimum occurrence to be considered
const MIN_OCCURRENCES = 5;

async function extractKeywords() {
  console.log('🔍 Extracting keywords from products...\n');
  
  try {
    // Get all visible products
    const products = await sql`
      SELECT id, title, content 
      FROM products 
      WHERE is_visible = true
    `;
    
    console.log(`📦 Analyzing ${products.rows.length} products...\n`);
    
    // Count word occurrences
    const wordCounts = new Map();
    
    for (const product of products.rows) {
      // Extract words from title
      const titleWords = extractWords(product.title);
      titleWords.forEach(word => {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 2); // Title words count double
      });
      
      // Extract words from content
      if (product.content) {
        const contentWords = extractWords(product.content);
        contentWords.forEach(word => {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        });
      }
    }
    
    // Filter and sort
    const keywords = Array.from(wordCounts.entries())
      .filter(([word, count]) => count >= MIN_OCCURRENCES)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200); // Top 200 keywords
    
    console.log('📊 Top 200 Keywords:\n');
    
    // Categorize keywords
    const categorized = categorizeKeywords(keywords);
    
    Object.entries(categorized).forEach(([category, words]) => {
      if (words.length > 0) {
        console.log(`\n${category}:`);
        words.slice(0, 30).forEach(([word, count]) => {
          console.log(`  - ${word} (${count}x)`);
        });
      }
    });
    
    // Generate code for available-tags.js
    console.log('\n\n📝 Code to add to available-tags.js:\n');
    console.log('```javascript');
    Object.entries(categorized).forEach(([category, words]) => {
      if (words.length > 0) {
        const wordList = words.slice(0, 50).map(([word]) => `'${word}'`).join(', ');
        console.log(`  ${category}: [${wordList}],`);
      }
    });
    console.log('```');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Extract clean words from text
 */
function extractWords(text) {
  if (!text) return [];
  
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/[^a-zà-ÿ\s-]/g, ' ') // Keep only letters and hyphens
    .split(/\s+/)
    .filter(word => 
      word.length >= MIN_LENGTH && 
      !STOPWORDS.has(word) &&
      !word.match(/^\d+$/) && // No pure numbers
      !word.match(/^[a-z]{1,2}$/) // No single/double letters
    )
    .map(word => word.trim())
    .filter(Boolean);
}

/**
 * Categorize keywords by type
 */
function categorizeKeywords(keywords) {
  const artists = ['gogh', 'vincent', 'klimt', 'gustav', 'mondriaan', 'piet', 'koons', 
                   'modigliani', 'picasso', 'rembrandt', 'vermeer', 'escher', 'dali', 
                   'warhol', 'banksy', 'hokusai', 'mucha', 'deleu', 'pompon', 'rodin'];
  
  const materials = ['brons', 'bronzen', 'keramiek', 'porselein', 'hout', 'glas', 
                     'metaal', 'kunsthars', 'resin', 'marmer', 'steen'];
  
  const subjects = ['hart', 'liefde', 'vogel', 'hond', 'kat', 'paard', 'olifant', 
                    'vis', 'bloem', 'boom', 'huis', 'muziek', 'dans', 'sport'];
  
  const emotions = ['geluk', 'blijdschap', 'vreugde', 'trots', 'dankbaarheid', 
                    'vertrouwen', 'hoop', 'inspiratie', 'passie', 'harmonie'];
  
  return {
    artists: keywords.filter(([word]) => artists.some(a => word.includes(a))),
    materials: keywords.filter(([word]) => materials.some(m => word.includes(m))),
    subjects: keywords.filter(([word]) => subjects.some(s => word.includes(s))),
    emotions: keywords.filter(([word]) => emotions.some(e => word.includes(e))),
    general: keywords.filter(([word]) => 
      !artists.some(a => word.includes(a)) &&
      !materials.some(m => word.includes(m)) &&
      !subjects.some(s => word.includes(s)) &&
      !emotions.some(e => word.includes(e))
    )
  };
}

extractKeywords();

