#!/usr/bin/env node
/**
 * Analyze product dimensions to determine reasonable size categories
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL);

async function analyzeDimensions() {
  console.log('📏 Analyzing product dimensions...\n');
  
  const products = await sql`
    SELECT dimensions, title
    FROM products 
    WHERE dimensions IS NOT NULL
    AND is_visible = true
    ORDER BY RANDOM()
    LIMIT 100
  `;
  
  console.log(`Found ${products.length} products with dimensions:\n`);
  
  // Parse dimensions and extract heights
  const heights = [];
  const dimensionPatterns = [];
  
  products.forEach(p => {
    dimensionPatterns.push(p.dimensions);
    
    // Try to extract height (usually the last number, or H value)
    const matches = p.dimensions.match(/(\d+)\s*(?:cm|CM)?\s*(?:h|H|hoog|hoogte)?/g);
    if (matches) {
      const nums = matches.map(m => parseInt(m.match(/\d+/)[0]));
      if (nums.length > 0) {
        heights.push(Math.max(...nums)); // Use largest dimension as "height"
      }
    }
  });
  
  // Show sample patterns
  console.log('Sample dimension formats:');
  dimensionPatterns.slice(0, 20).forEach(d => console.log(`  ${d}`));
  
  // Calculate percentiles
  heights.sort((a, b) => a - b);
  console.log(`\n📊 Height statistics (${heights.length} parsed):`);
  console.log(`  Min: ${heights[0]} cm`);
  console.log(`  25th percentile: ${heights[Math.floor(heights.length * 0.25)]} cm`);
  console.log(`  Median: ${heights[Math.floor(heights.length * 0.5)]} cm`);
  console.log(`  75th percentile: ${heights[Math.floor(heights.length * 0.75)]} cm`);
  console.log(`  Max: ${heights[heights.length - 1]} cm`);
  
  console.log('\n💡 Suggested size categories:');
  console.log(`  Klein: < 15 cm`);
  console.log(`  Middel: 15-30 cm`);
  console.log(`  Groot: > 30 cm`);
  
  await sql.end();
}

analyzeDimensions().catch(console.error);

