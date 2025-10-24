/**
 * Analyze product types in database
 * Shows distribution and examples
 */
import 'dotenv/config';
import { sql } from '@vercel/postgres';

async function analyzeTypes() {
  try {
    console.log('🔍 Analyzing product types in database...\n');
    
    // Get type distribution
    const typeStats = await sql`
      SELECT 
        type,
        COUNT(*) as count,
        ROUND(AVG(price), 2) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price
      FROM products
      WHERE is_visible = true
      GROUP BY type
      ORDER BY count DESC
    `;
    
    console.log('📊 Type Distribution:\n');
    console.log('Type'.padEnd(20) + 'Count'.padEnd(10) + 'Avg Price'.padEnd(15) + 'Price Range');
    console.log('─'.repeat(70));
    
    const types = [];
    let totalWithType = 0;
    let totalWithoutType = 0;
    
    for (const row of typeStats.rows) {
      const type = row.type || '(no type)';
      const count = row.count;
      const avgPrice = row.avg_price ? `€${row.avg_price}` : '-';
      const priceRange = row.min_price && row.max_price 
        ? `€${row.min_price} - €${row.max_price}`
        : '-';
      
      console.log(
        type.padEnd(20) + 
        count.toString().padEnd(10) + 
        avgPrice.padEnd(15) + 
        priceRange
      );
      
      if (row.type) {
        types.push(row.type);
        totalWithType += count;
      } else {
        totalWithoutType += count;
      }
    }
    
    console.log('─'.repeat(70));
    console.log(`Total with type: ${totalWithType}`);
    console.log(`Total without type: ${totalWithoutType}`);
    console.log(`Coverage: ${((totalWithType / (totalWithType + totalWithoutType)) * 100).toFixed(1)}%\n`);
    
    // Show examples for each type
    console.log('📝 Example products per type:\n');
    
    for (const type of types) {
      const examples = await sql`
        SELECT title, price, brand
        FROM products
        WHERE type = ${type} AND is_visible = true
        ORDER BY stock_sold DESC NULLS LAST
        LIMIT 3
      `;
      
      console.log(`\n${type}:`);
      for (const ex of examples.rows) {
        console.log(`  - ${ex.title} (€${ex.price})`);
      }
    }
    
    // Show products without type
    console.log('\n\n❓ Products without type (sample):');
    const noType = await sql`
      SELECT p.title, p.price, 
             ARRAY_AGG(DISTINCT c.title) FILTER (WHERE c.title IS NOT NULL) as categories
      FROM products p
      LEFT JOIN product_categories pc ON p.id = pc.product_id
      LEFT JOIN categories c ON pc.category_id = c.id
      WHERE p.type IS NULL AND p.is_visible = true
      GROUP BY p.id, p.title, p.price
      ORDER BY p.stock_sold DESC NULLS LAST
      LIMIT 10
    `;
    
    for (const row of noType.rows) {
      const cats = row.categories ? row.categories.join(', ') : 'no category';
      console.log(`  - ${row.title} (€${row.price}) [${cats}]`);
    }
    
    // Generate type list for code
    console.log('\n\n💡 Detected types for AI prompt:');
    console.log(JSON.stringify(types, null, 2));
    
    console.log('\n✅ Analysis complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

analyzeTypes();

