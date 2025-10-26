#!/usr/bin/env node
/**
 * Fetch distinct product types from the database and save to data/product-types.json
 * Run this after importing products to keep types up-to-date
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('❌ Missing POSTGRES_URL in .env');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function fetchProductTypes() {
  console.log('🔍 Fetching distinct product types from database...');
  
  try {
    const result = await sql`
      SELECT DISTINCT type, COUNT(*) as count
      FROM products
      WHERE type IS NOT NULL AND type != ''
      GROUP BY type
      ORDER BY count DESC, type ASC
    `;
    
    console.log(`\n✅ Found ${result.length} product types\n`);
    
    // Display statistics
    console.log('📊 Product type statistics:');
    result.forEach(row => {
      console.log(`   ${row.type.padEnd(20)} (${row.count} products)`);
    });
    
    // Extract just the type names
    const types = result.map(row => row.type);
    
    // Save to data/product-types.json
    const outputPath = path.join(__dirname, '..', 'data', 'product-types.json');
    fs.writeFileSync(outputPath, JSON.stringify(types, null, 2));
    
    console.log(`\n💾 Saved to: ${outputPath}`);
    
    return types;
  } catch (error) {
    console.error('❌ Error fetching product types:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

async function main() {
  try {
    await fetchProductTypes();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

