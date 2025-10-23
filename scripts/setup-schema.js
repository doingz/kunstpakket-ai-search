#!/usr/bin/env node
/**
 * Database schema setup script
 * Runs all SQL migration files in order
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.join(__dirname, '..', 'schema');

async function runSchemaFile(filePath) {
  const filename = path.basename(filePath);
  console.log(`\n📄 Running ${filename}...`);
  
  try {
    const sqlContent = await fs.readFile(filePath, 'utf-8');
    
    // Execute the SQL (note: this runs as a single query)
    await sql.query(sqlContent);
    
    console.log(`✅ ${filename} completed`);
    return true;
  } catch (error) {
    console.error(`❌ ${filename} failed:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔧 Setting up database schema...');
  console.log(`   Database: ${process.env.DATABASE_URL ? 'Connected' : '❌ DATABASE_URL not set'}`);
  
  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL environment variable is required');
    console.error('   Set it in your .env file');
    process.exit(1);
  }

  // Enable pg_trgm extension first
  console.log('\n🔌 Enabling PostgreSQL extensions...');
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    console.log('✅ pg_trgm extension enabled (for fuzzy text matching)');
  } catch (error) {
    console.error('⚠️  Could not enable pg_trgm:', error.message);
  }

  // Get all SQL files in schema directory
  const files = await fs.readdir(schemaDir);
  const sqlFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort(); // Run in alphabetical order (001, 002, etc.)

  console.log(`\nFound ${sqlFiles.length} schema files`);

  let successCount = 0;
  for (const file of sqlFiles) {
    const filePath = path.join(schemaDir, file);
    const success = await runSchemaFile(filePath);
    if (success) successCount++;
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Schema setup complete: ${successCount}/${sqlFiles.length} files succeeded`);
  
  if (successCount < sqlFiles.length) {
    console.error(`❌ ${sqlFiles.length - successCount} files failed`);
    process.exit(1);
  }

  // Test connection
  console.log('\n🔍 Testing database...');
  const testResult = await sql`SELECT current_database(), version()`;
  console.log(`✅ Connected to: ${testResult.rows[0].current_database}`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Schema setup failed:', err.message);
  process.exit(1);
});

