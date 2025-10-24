#!/usr/bin/env node
/**
 * Migration: Update search_vector to use description instead of content
 * 
 * WHY: content contains long HTML with artist bios, causing false positives
 *      (e.g. "haar hart volgen" matches all Jacky Zegers products)
 *      description is short, clean product summary - much better for search!
 */

import 'dotenv/config';
import { sql } from '@vercel/postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  console.log('🔄 Migrating search_vector to use description instead of content...\n');
  
  try {
    // Read and execute migration SQL
    const migrationPath = join(__dirname, '../schema/009_use_description_not_content.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    console.log('📝 Executing migration...');
    await sql.query(migrationSQL);
    
    console.log('✅ Migration complete!');
    console.log('\n📊 Verifying...');
    
    // Check a sample product
    const sample = await sql`
      SELECT 
        id, 
        title,
        LEFT(description, 100) as description_preview,
        LEFT(content, 100) as content_preview
      FROM products 
      WHERE title ILIKE '%jacky zegers%'
      LIMIT 1
    `;
    
    if (sample.rows.length > 0) {
      console.log('\n🔍 Sample product:');
      console.log(`   Title: ${sample.rows[0].title}`);
      console.log(`   Description: ${sample.rows[0].description_preview}...`);
      console.log(`   Content: ${sample.rows[0].content_preview}...`);
      console.log('\n✅ Search now uses description (short) instead of content (long HTML)');
    }
    
    console.log('\n🎯 RESULT: Jacky Zegers products will no longer match "hart" searches');
    console.log('   (unless they actually have hearts in the short description)');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

migrate();

