#!/usr/bin/env node
/**
 * Full setup script - runs all setup steps in sequence
 * Usage: node scripts/full-setup.js
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';

function run(command, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 ${description}`);
  console.log(`${'='.repeat(60)}\n`);
  
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`\n✅ ${description} - Complete!`);
    return true;
  } catch (error) {
    console.error(`\n❌ ${description} - Failed!`);
    return false;
  }
}

async function main() {
  console.log('\n🚀 Kunstpakket AI Search - Full Setup\n');
  
  // Check environment variables
  const required = ['DATABASE_URL', 'OPENAI_API_KEY', 'LIGHTSPEED_API_KEY', 'LIGHTSPEED_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease set them in your .env file');
    process.exit(1);
  }

  console.log('✅ Environment variables configured\n');

  // Step 1: Sync from Lightspeed
  if (!run('npm run sync', 'Step 1/4: Sync data from Lightspeed')) {
    console.error('\n❌ Setup failed at step 1');
    process.exit(1);
  }

  // Step 2: Setup database schema
  if (!run('npm run db:schema', 'Step 2/4: Setup database schema')) {
    console.error('\n❌ Setup failed at step 2');
    process.exit(1);
  }

  // Step 3: Import data
  if (!run('npm run import', 'Step 3/4: Import data to Neon')) {
    console.error('\n❌ Setup failed at step 3');
    process.exit(1);
  }

  // Step 4: Test search
  console.log(`\n${'='.repeat(60)}`);
  console.log('🧪 Step 4/4: Testing search');
  console.log(`${'='.repeat(60)}\n`);
  console.log('Running test query: "beeldje met hart max 80 euro"\n');
  
  if (!run('npm run search "beeldje met hart max 80 euro"', 'Test search')) {
    console.error('\n⚠️  Search test failed, but setup is complete');
    console.error('   You can debug this separately');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ SETUP COMPLETE!');
  console.log('='.repeat(60));
  console.log('\nYou can now:');
  console.log('  - Test search: npm run search "your query"');
  console.log('  - Use the API: import { search } from "./api/search.js"');
  console.log('  - Re-sync data: npm run sync && npm run import');
  console.log('\n');
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  process.exit(1);
});

