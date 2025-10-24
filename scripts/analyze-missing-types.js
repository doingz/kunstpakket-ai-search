/**
 * Analyze products without type to find patterns in title/description
 */
import 'dotenv/config';
import { sql } from '@vercel/postgres';

async function analyzeMissingTypes() {
  try {
    console.log('🔍 Analyzing products without type...\n');
    
    const products = await sql`
      SELECT id, title, content
      FROM products
      WHERE is_visible = true AND type IS NULL
      ORDER BY stock_sold DESC NULLS LAST
      LIMIT 50
    `;
    
    console.log(`Found ${products.rows.length} products without type:\n`);
    
    // Keywords to search for
    const typeKeywords = {
      Beeld: ['beeld', 'beeldje', 'beeldjes', 'sculptuur', 'sculpture', 'statue', 'figuur', 'figurine', 'bronzen', 'brons'],
      Schilderij: ['schilderij', 'schildering', 'painting', 'giclee', 'giclée', 'print', 'prent', 'zeefdruk', 'canvas', 'doek'],
      Vaas: ['vaas', 'vazen', 'vase', 'bloemenvaas'],
      Mok: ['mok', 'beker', 'koffiemok', 'theemok', 'cup', 'mug', 'kop', 'kopje', 'espresso', 'theepot', 'koffiepot'],
      Wandbord: ['wandbord', 'bord', 'decoratief bord', 'plate', 'keramiek'],
      Schaal: ['schaal', 'schalen', 'bowl', 'kom'],
      Glasobject: ['glasobject', 'glazen', 'glas kunst', 'kristal', 'glas', 'karaf'],
      Decoratie: ['onderzetter', 'onderzetters', 'coaster', 'sleutelhanger', 'wijnstop', 'theelicht']
    };
    
    const suggestions = {};
    
    for (const product of products.rows) {
      const text = (product.title + ' ' + (product.content || '')).toLowerCase();
      
      let foundType = null;
      
      for (const [type, keywords] of Object.entries(typeKeywords)) {
        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            foundType = type;
            break;
          }
        }
        if (foundType) break;
      }
      
      if (foundType) {
        if (!suggestions[foundType]) suggestions[foundType] = [];
        suggestions[foundType].push({
          title: product.title,
          id: product.id
        });
      } else {
        console.log(`❓ No match: ${product.title}`);
      }
    }
    
    console.log('\n📊 Suggested types based on content:\n');
    
    for (const [type, products] of Object.entries(suggestions)) {
      console.log(`\n${type} (${products.length} products):`);
      products.slice(0, 5).forEach(p => {
        console.log(`  - ${p.title}`);
      });
      if (products.length > 5) {
        console.log(`  ... and ${products.length - 5} more`);
      }
    }
    
    // Show keywords that might need to be added
    console.log('\n\n💡 Keywords found in descriptions (might need to add to type-detector):');
    const keywordCounts = {};
    
    for (const product of products.rows) {
      const content = (product.content || '').toLowerCase();
      
      // Check for common art/gift keywords
      const checkWords = ['sculptuur', 'sculpture', 'onderzetter', 'onderzetters', 'kop en schotel', 
                          'theepot', 'koffiepot', 'espresso', 'karaf', 'glas', 'kristal', 
                          'keramiek', 'porselein', 'canvas', 'doek', 'wijnstop', 'sleutelhanger'];
      
      for (const word of checkWords) {
        if (content.includes(word)) {
          keywordCounts[word] = (keywordCounts[word] || 0) + 1;
        }
      }
    }
    
    const sorted = Object.entries(keywordCounts).sort((a, b) => b[1] - a[1]);
    for (const [word, count] of sorted.slice(0, 15)) {
      console.log(`  ${word}: ${count} products`);
    }
    
    console.log('\n✅ Analysis complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

analyzeMissingTypes();

