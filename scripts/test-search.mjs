#!/usr/bin/env node
/**
 * Comprehensive search tests
 * Tests all aspects: brands, types, keywords, prices, combinations
 */

const API_URL = 'https://kunstpakket.bluestars.app/api/search';

// Test cases organized by category
const tests = {
  'Brand searches (dynamic brand data)': [
    { query: 'kokeshi', expect: { artist: 'Kokeshi dolls', type: 'Beeld' } },
    { query: 'kokeshi beeld', expect: { artist: 'Kokeshi dolls', type: 'Beeld' } },
    { query: 'klimt', expect: { artist: 'Gustav Klimt' } },
    { query: 'van gogh', expect: { artist: 'Vincent van Gogh' } },
    { query: 'jeff koons', expect: { artist: 'Jeff Koons' } },
    { query: 'forchino', expect: { artist: 'Guillermo Forchino beelden' } },
    { query: 'herman brood', expect: { artist: 'Herman Brood' } },
  ],
  
  'Product types (dynamic from database)': [
    { query: 'beeld', expect: { type: 'Beeld', minResults: 10 } },
    { query: 'schilderij', expect: { type: 'Schilderij', minResults: 5 } },
    { query: 'vaas', expect: { type: 'Vaas', minResults: 5 } },
    { query: 'mok', expect: { type: 'Mok', minResults: 5 } },
    { query: 'theelichthouder', expect: { type: 'Theelichthouder', minResults: 1 } },
  ],
  
  'Price filters': [
    { query: 'onder 50 euro', expect: { priceMax: 50, minResults: 10 } },
    { query: 'max 100 euro', expect: { priceMax: 100 } }, // Price-only queries have low semantic match (users will add type/keyword)
    { query: 'beeld onder 80 euro', expect: { type: 'Beeld', priceMax: 80, minResults: 10 } },
  ],
  
  'Keywords with English translations & enrichment': [
    { query: 'hond', expect: { minResults: 5 } }, // AI enriches with plural & English
    { query: 'dog', expect: { minResults: 5 } },
    { query: 'kat', expect: { minResults: 3 } }, // AI enriches with katten, cats
    { query: 'poes', expect: { minResults: 3 } },
    { query: 'vriendschap', expect: { minResults: 5 } }, // AI enriches with vriend, vrienden, friendship
    { query: 'samenwerking', expect: { minResults: 3 } }, // AI enriches with team, teamwork, collaboration
    { query: 'liefde', expect: { minResults: 10 } }, // AI enriches with love, heart, hart
  ],
  
  'Combined filters': [
    { query: 'kokeshi beeld onder 100 euro', expect: { type: 'Beeld', priceMax: 100, minResults: 1 } }, // Artist detection is optional
    { query: 'klimt mok', expect: { artist: 'Gustav Klimt', type: 'Mok' } },
    { query: 'sportbeeld max 150 euro', expect: { type: 'Beeld', priceMax: 150 } },
    { query: 'klein beeld met een kat onder 50 euro', expect: { type: 'Beeld', sizeCategory: 'klein', priceMax: 50, minResults: 1 } },
    { query: 'groot bronzen beeld', expect: { type: 'Beeld', sizeCategory: 'groot', minResults: 5 } },
  ],
  
  'Vague queries (should trigger help)': [
    { query: 'cadeau voor mijn zus', expect: { keywords: [], results: 0 } },
    { query: 'iets moois', expect: { keywords: [], results: 0 } },
    { query: 'geschenk', expect: { keywords: [], results: 0 } },
  ],
  
  'Category mappings (dynamic from categories.json)': [
    { query: 'sportbeeld', expect: { type: 'Beeld', minResults: 5 } }, // AI adds synonyms (fitness, atleet) - this is good!
    { query: 'huwelijksbeeld', expect: { minResults: 3 } }, // AI adds synonyms (trouwen, bruiloft) - better coverage!
    { query: 'zakelijk cadeau', expect: { minResults: 5 } }, // AI adds synonyms (business, team) - more results!
  ],
  
  'Theme-based searches (test enrichment)': [
    { query: 'muziek', expect: { minResults: 3 } }, // Should enrich with music, instrument
    { query: 'bloemen', expect: { minResults: 5 } }, // Should enrich with flowers, floral
    { query: 'natuur', expect: { minResults: 2 } }, // Limited nature-themed products
    { query: 'abstract', expect: { minResults: 3 } }, // Should find abstract art
    { query: 'modern', expect: { minResults: 5 } }, // Should enrich with moderne, contemporary
  ],
  
  'Size-based searches': [
    { query: 'klein beeldje', expect: { type: 'Beeld', sizeCategory: 'klein', minResults: 5 } },
    { query: 'groot beeld', expect: { type: 'Beeld', sizeCategory: 'groot', minResults: 5 } },
    { query: 'klein beeld voor op bureau', expect: { type: 'Beeld', sizeCategory: 'klein', minResults: 3 } }, // More specific
  ],
  
  'Complex multi-filter searches': [
    { query: 'klein modern beeld onder 100 euro', expect: { type: 'Beeld', sizeCategory: 'klein', priceMax: 100, minResults: 1 } },
    { query: 'klimt mok max 100 euro', expect: { artist: 'Gustav Klimt', type: 'Mok', priceMax: 100, minResults: 1 } }, // Klimt mugs are affordable
    { query: 'sportbeeld met een voetballer onder 150 euro', expect: { type: 'Beeld', priceMax: 150, minResults: 1 } },
  ]
};

let passedTests = 0;
let failedTests = 0;
let totalTests = 0;

async function runTest(category, testCase) {
  totalTests++;
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: testCase.query })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const filters = data.query.filters;
    const results = data.results.total;
    
    // Check expectations
    let passed = true;
    let errors = [];
    
    if (testCase.expect.artist && filters.artist !== testCase.expect.artist) {
      passed = false;
      errors.push(`Artist mismatch: got "${filters.artist}", expected "${testCase.expect.artist}"`);
    }
    
    if (testCase.expect.type && filters.productType !== testCase.expect.type) {
      passed = false;
      errors.push(`Type mismatch: got "${filters.productType}", expected "${testCase.expect.type}"`);
    }
    
    if (testCase.expect.priceMax && filters.priceMax !== testCase.expect.priceMax) {
      passed = false;
      errors.push(`PriceMax mismatch: got ${filters.priceMax}, expected ${testCase.expect.priceMax}`);
    }
    
    if (testCase.expect.keywords && JSON.stringify(filters.keywords) !== JSON.stringify(testCase.expect.keywords)) {
      passed = false;
      errors.push(`Keywords mismatch: got ${JSON.stringify(filters.keywords)}, expected ${JSON.stringify(testCase.expect.keywords)}`);
    }
    
    if (testCase.expect.minResults && results < testCase.expect.minResults) {
      passed = false;
      errors.push(`Too few results: got ${results}, expected at least ${testCase.expect.minResults}`);
    }
    
    if (testCase.expect.results !== undefined && results !== testCase.expect.results) {
      passed = false;
      errors.push(`Result count mismatch: got ${results}, expected ${testCase.expect.results}`);
    }
    
    if (passed) {
      passedTests++;
      console.log(`   ✅ "${testCase.query}" → ${results} results (${data.query.took_ms}ms)`);
    } else {
      failedTests++;
      console.log(`   ❌ "${testCase.query}"`);
      errors.forEach(err => console.log(`      ${err}`));
    }
    
  } catch (error) {
    failedTests++;
    console.log(`   ❌ "${testCase.query}" - Error: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('🧪 Starting comprehensive search tests...\n');
  console.log(`API: ${API_URL}\n`);
  
  for (const [category, testCases] of Object.entries(tests)) {
    console.log(`\n📋 ${category}`);
    console.log('─'.repeat(60));
    
    for (const testCase of testCases) {
      await runTest(category, testCase);
      await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting + cache settling
    }
  }
  
  // Summary
  console.log('\n\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total tests:  ${totalTests}`);
  console.log(`✅ Passed:    ${passedTests} (${Math.round(passedTests/totalTests*100)}%)`);
  console.log(`❌ Failed:    ${failedTests} (${Math.round(failedTests/totalTests*100)}%)`);
  console.log('═'.repeat(60));
  
  if (failedTests === 0) {
    console.log('\n🎉 All tests passed! Dynamic catalog system works perfectly!\n');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.\n');
    process.exit(1);
  }
}

runAllTests();

