#!/usr/bin/env node
/**
 * Lightspeed → Local JSON sync script
 * Fetches products, variants, tags, categories from Lightspeed API
 * 
 * Usage:
 *   node scripts/sync-lightspeed.js
 * 
 * Or with inline env vars:
 *   LIGHTSPEED_API_KEY=xxx LIGHTSPEED_SECRET=yyy node scripts/sync-lightspeed.js
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.LIGHTSPEED_BASE_URL || 'https://api.webshopapp.com/nl';
const API_KEY = process.env.LIGHTSPEED_API_KEY;
const API_SECRET = process.env.LIGHTSPEED_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error('❌ Set LIGHTSPEED_API_KEY and LIGHTSPEED_SECRET environment variables');
  console.error('   Or create a .env file with these values');
  process.exit(1);
}

const basic = 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');

async function fetchAll(endpoint, key) {
  const items = [];
  let page = 1;
  
  while (true) {
    const res = await fetch(`${BASE_URL}${endpoint}?page=${page}&limit=250`, {
      headers: { 
        Accept: 'application/json', 
        Authorization: basic 
      }
    });
    
    if (res.status === 429) {
      // Rate limit hit - wait and retry
      console.log(`  ⏳ Rate limit hit on ${key} page ${page}, waiting 30s...`);
      await new Promise(r => setTimeout(r, 30_000));
      continue;
    }
    
    if (!res.ok) {
      throw new Error(`${endpoint} failed: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    
    // Extract items (handle various response formats)
    let pageItems = data?.[key];
    if (!pageItems) {
      pageItems = Object.values(data).find(v => Array.isArray(v)) || [];
    }
    
    if (!pageItems || pageItems.length === 0) {
      break;
    }
    
    items.push(...pageItems);
    console.log(`  ${key} page ${page}: +${pageItems.length} (total ${items.length})`);
    
    if (pageItems.length < 250) {
      break;
    }
    
    page++;
    
    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 100));
  }
  
  return items;
}

async function main() {
  console.log('🔄 Syncing data from Lightspeed...');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log('');
  
  const datasets = [
    { ep: '/products.json', key: 'products', out: 'products.json' },
    { ep: '/variants.json', key: 'variants', out: 'variants.json' },
    { ep: '/tags.json', key: 'tags', out: 'tags.json' },
    { ep: '/tags/products.json', key: 'tagsProducts', out: 'tags-products.json' },
    { ep: '/categories.json', key: 'categories', out: 'categories.json' },
    { ep: '/categories/products.json', key: 'categoriesProducts', out: 'categories-products.json' }
  ];

  const outputDir = path.join(process.cwd(), 'data');
  await fs.mkdir(outputDir, { recursive: true });

  const results = {};

  for (const { ep, key, out } of datasets) {
    console.log(`📦 Fetching ${key}...`);
    const items = await fetchAll(ep, key);
    const filePath = path.join(outputDir, out);
    await fs.writeFile(filePath, JSON.stringify(items, null, 2));
    console.log(`✅ Saved ${items.length} ${key} → ${filePath}`);
    console.log('');
    
    results[key] = items.length;
  }
  
  console.log('✅ Sync complete!');
  console.log(`   Files saved in: ${outputDir}/`);
  console.log('');
  console.log('📊 Summary:');
  Object.entries(results).forEach(([key, count]) => {
    console.log(`   ${key}: ${count}`);
  });
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

