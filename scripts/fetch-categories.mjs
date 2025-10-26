#!/usr/bin/env node
/**
 * Fetch all categories from Lightspeed and save to data/categories.json
 * Run this periodically to keep category data up-to-date
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.LIGHTSPEED_API_KEY;
const API_SECRET = process.env.LIGHTSPEED_SECRET;
const BASE_URL = process.env.LIGHTSPEED_BASE_URL || 'https://api.webshopapp.com/nl';

if (!API_KEY || !API_SECRET) {
  console.error('❌ Missing Lightspeed credentials in .env');
  process.exit(1);
}

const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');

async function fetchAllCategories() {
  console.log('🔍 Fetching categories from Lightspeed...');
  
  let allCategories = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${BASE_URL}/categories.json?page=${page}&limit=250`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const categories = data.categories || [];
      
      if (categories.length === 0) {
        hasMore = false;
      } else {
        console.log(`   Page ${page}: ${categories.length} categories`);
        allCategories.push(...categories);
        page++;
      }
    } catch (error) {
      console.error(`❌ Error fetching page ${page}:`, error.message);
      hasMore = false;
    }
  }

  return allCategories;
}

async function main() {
  try {
    const categories = await fetchAllCategories();
    
    console.log(`\n✅ Fetched ${categories.length} total categories`);
    
    // Extract only id and title for compact storage
    const categoryData = categories.map(cat => ({
      id: cat.id,
      title: cat.title
    }));
    
    // Sort by ID for easier reading
    categoryData.sort((a, b) => a.id - b.id);
    
    // Save to data/categories.json
    const outputPath = path.join(__dirname, '..', 'data', 'categories.json');
    fs.writeFileSync(outputPath, JSON.stringify(categoryData, null, 2));
    
    console.log(`💾 Saved to: ${outputPath}`);
    console.log(`\n📊 Category statistics:`);
    console.log(`   Total categories: ${categoryData.length}`);
    console.log(`   First 10 categories:`);
    categoryData.slice(0, 10).forEach(cat => {
      console.log(`      ${cat.id}: ${cat.title}`);
    });
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

