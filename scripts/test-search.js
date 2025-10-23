#!/usr/bin/env node
/**
 * Test search functionality from command line
 * Usage: npm run search "beeldje met hart max 80 euro"
 */
import 'dotenv/config';
import { search } from '../api/search.js';

const query = process.argv[2];

if (!query) {
  console.error('❌ Usage: npm run search "your search query"');
  console.error('   Example: npm run search "beeldje met hart max 80 euro"');
  process.exit(1);
}

async function main() {
  console.log('🔍 Kunstpakket AI Search Test\n');
  console.log('='.repeat(60));
  
  const result = await search(query, 5, 0); // Show top 5 results
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTS\n');
  
  if (!result.success) {
    console.error('❌ Search failed:', result.error);
    if (result.suggestion) {
      console.log('\n💡 Suggestion:', result.suggestion);
    }
    process.exit(1);
  }

  console.log(`Query: "${result.query.original}"`);
  console.log(`Confidence: ${(result.query.confidence * 100).toFixed(0)}%`);
  console.log(`\nParsed filters:`);
  console.log(JSON.stringify(result.query.parsed, null, 2));
  
  console.log(`\n📦 Found ${result.results.total} products (showing ${result.results.showing})`);
  
  if (result.results.items.length > 0) {
    console.log('\n🎯 Top results:');
    result.results.items.forEach((item, idx) => {
      const highlight = result.results.highlighted.includes(idx) ? '⭐' : '  ';
      console.log(`${highlight} ${idx + 1}. ${item.title}`);
      console.log(`      €${item.price} - ${item.url || 'no url'}`);
      if (item.content) {
        const preview = item.content.substring(0, 80).replace(/\n/g, ' ');
        console.log(`      ${preview}...`);
      }
    });
  }

  console.log('\n💬 AI Advice:');
  console.log(`   "${result.results.advice}"`);

  console.log('\n⏱️  Performance:');
  console.log(`   AI Parse: ${result.meta.ai_parse_ms}ms`);
  console.log(`   DB Query: ${result.meta.db_query_ms}ms`);
  console.log(`   AI Advice: ${result.meta.ai_advice_ms}ms`);
  console.log(`   Total: ${result.meta.took_ms}ms`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete!\n');
}

main().catch(err => {
  console.error('\n❌ Error:', err);
  process.exit(1);
});

