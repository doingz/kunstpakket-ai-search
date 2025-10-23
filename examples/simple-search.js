/**
 * Simple example of using the search API programmatically
 */
import { search } from '../api/search.js';

async function main() {
  // Example 1: Basic search
  console.log('Example 1: Basic search\n');
  const result1 = await search('beeldje', 5, 0);
  
  if (result1.success) {
    console.log(`Found ${result1.results.total} beeldjes`);
    console.log(`Advice: ${result1.results.advice}\n`);
  }

  // Example 2: Search with filters
  console.log('\nExample 2: Search with filters\n');
  const result2 = await search('beeldje met hart max 80 euro', 10, 0);
  
  if (result2.success) {
    console.log(`Query parsed as:`, result2.query.parsed);
    console.log(`\nFound ${result2.results.total} products`);
    console.log(`Showing top ${result2.results.showing}:\n`);
    
    result2.results.items.forEach((item, idx) => {
      const star = result2.results.highlighted.includes(idx) ? '⭐' : '';
      console.log(`${star} ${item.title} - €${item.price}`);
    });
    
    console.log(`\nAI Advice: ${result2.results.advice}`);
    console.log(`\nPerformance: ${result2.meta.took_ms}ms total`);
  }

  // Example 3: Pagination
  console.log('\n\nExample 3: Pagination\n');
  const page1 = await search('cadeau', 5, 0);  // First 5
  const page2 = await search('cadeau', 5, 5);  // Next 5
  
  if (page1.success) {
    console.log(`Total: ${page1.results.total} cadeaus`);
    console.log(`Page 1: ${page1.results.items.length} items`);
    console.log(`Page 2: ${page2.results.items.length} items`);
  }
}

main().catch(console.error);

