/**
 * Setup database schema with pgvector
 * Run with: node scripts/setup-schema.js
 */
import { sql } from '@vercel/postgres';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function setupSchema() {
  console.log('🗄️  Setting up database schema...\n');
  
  try {
    // Read and execute schema file directly
    const schemaSQL = fs.readFileSync('schema/001_init.sql', 'utf-8');
    
    console.log('📝 Executing schema SQL...\n');
    
    try {
      await sql.query(schemaSQL);
      console.log('✅ Schema executed successfully\n');
    } catch (error) {
      // Some errors are okay (like extension already exists)
      if (error.message.includes('already exists')) {
        console.log('⚠️  Some objects already exist (continuing)\n');
      } else {
        console.error('Schema execution error:', error.message);
        throw error;
      }
    }
    
    console.log('✅ Schema setup complete!\n');
    
    // Verify pgvector is installed
    const result = await sql`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname = 'vector'
    `;
    
    if (result.rows.length > 0) {
      console.log(`✅ pgvector extension installed: v${result.rows[0].extversion}`);
    } else {
      console.log('❌ pgvector extension not found!');
    }
    
  } catch (error) {
    console.error('❌ Schema setup failed:', error);
    process.exit(1);
  }
}

setupSchema()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });

