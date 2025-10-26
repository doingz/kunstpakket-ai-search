#!/usr/bin/env node
/**
 * Test catalog metadata loading
 */

import { getCatalogMetadata, getBrandNormalizationRules, buildPromptInstructions } from '../lib/catalog-metadata.ts';

console.log('🧪 Testing catalog metadata...\n');

try {
  const metadata = getCatalogMetadata();
  
  console.log('✅ Catalog metadata loaded:');
  console.log(`   Brands: ${metadata.brands.length}`);
  console.log(`   Categories: ${metadata.categories.length}`);
  console.log(`   Product Types: ${metadata.productTypes.length}`);
  console.log(`   Themes: ${metadata.popularThemes.length}`);
  console.log(`   Category Map: ${metadata.categoryMap.size} entries`);
  
  console.log('\n📋 First 10 brands:');
  metadata.brands.slice(0, 10).forEach(b => console.log(`   - ${b}`));
  
  console.log('\n📋 Product types:');
  metadata.productTypes.forEach(t => console.log(`   - ${t}`));
  
  console.log('\n📋 Brand normalization rules (first 10):');
  const rules = getBrandNormalizationRules().split('\n');
  rules.slice(0, 10).forEach(r => console.log(`   ${r}`));
  
  console.log(`\n📋 Total normalization rules: ${rules.length}`);
  
  console.log('\n📋 AI Prompt Instructions (first 500 chars):');
  const instructions = buildPromptInstructions();
  console.log(instructions.substring(0, 500) + '...');
  
  console.log(`\n📏 Total prompt length: ${instructions.length} characters`);
  
  console.log('\n✅ All tests passed!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}

