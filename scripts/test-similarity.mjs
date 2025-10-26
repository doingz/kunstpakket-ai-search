#!/usr/bin/env node
/**
 * Test similarity scores for failing queries
 */
import 'dotenv/config';
import postgres from 'postgres';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

const sql = postgres(process.env.POSTGRES_URL);

async function testQuery(queryText, filters = {}) {
  console.log(`\n🔍 Testing: "${queryText}"`);
  console.log(`   Filters:`, JSON.stringify(filters));
  
  // Generate embedding
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: queryText
  });
  
  // Build WHERE clause
  let whereClause = 'is_visible = true AND embedding IS NOT NULL';
  const params = [JSON.stringify(embedding)];
  let paramIndex = 2;
  
  if (filters.type) {
    params.push(filters.type);
    whereClause += ` AND type = $${paramIndex++}`;
  }
  
  if (filters.keywords && filters.keywords.length > 0) {
    const keywordConditions = filters.keywords.map(keyword => {
      params.push(`%${keyword}%`);
      return `(title ILIKE $${paramIndex++} OR description ILIKE $${paramIndex - 1})`;
    }).join(' OR ');
    
    whereClause += ` AND (${keywordConditions})`;
  }
  
  // Query with different thresholds
  const thresholds = [0.70, 0.50, 0.35, 0.25, 0.15, 0.05];
  
  for (const threshold of thresholds) {
    const result = await sql.unsafe(`
      SELECT 
        id, title, type,
        1 - (embedding <=> $1::vector) as similarity
      FROM products
      WHERE ${whereClause}
        AND (1 - (embedding <=> $1::vector)) >= ${threshold}
      ORDER BY embedding <=> $1::vector
      LIMIT 5
    `, params);
    
    console.log(`   Threshold ${threshold}: ${result.length} results`);
    if (result.length > 0) {
      result.forEach(r => {
        console.log(`      ${r.similarity.toFixed(3)} - ${r.title.substring(0, 60)}`);
      });
    }
  }
}

async function main() {
  console.log('🧪 Testing similarity thresholds for failing queries...\n');
  console.log('═'.repeat(70));
  
  await testQuery('mok', { type: 'Mok' });
  await testQuery('dog', { keywords: ['hond', 'honden', 'dog'] });
  await testQuery('max 100 euro', {});
  
  console.log('\n' + '═'.repeat(70));
  await sql.end();
}

main().catch(console.error);

