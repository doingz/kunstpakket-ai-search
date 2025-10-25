/**
 * Generate embeddings for all existing products
 * One-time script to populate embedding column
 */

import 'dotenv/config';
import { sql } from '@vercel/postgres';
import { generateEmbeddingsBatch } from '../lib/generate-embeddings.js';

const BATCH_SIZE = 100;

async function generateAllEmbeddings() {
  console.log('🔮 Generating embeddings for all products...\n');
  
  // Get all visible products WITH their categories
  // Note: brand is just an ID stored as text, we don't have brand names
  const { rows } = await sql`
    SELECT 
      p.id, 
      p.title, 
      p.full_title, 
      p.description, 
      p.type,
      p.brand as brand_name,
      ARRAY_AGG(DISTINCT c.title) FILTER (WHERE c.title IS NOT NULL) as categories
    FROM products p
    LEFT JOIN product_categories pc ON p.id = pc.product_id
    LEFT JOIN categories c ON pc.category_id = c.id
    WHERE p.is_visible = true
    GROUP BY p.id, p.title, p.full_title, p.description, p.type, p.brand
    ORDER BY p.id
  `;
  
  console.log(`Found ${rows.length} products to process`);
  console.log(`Cost estimate: ~€${(rows.length * 0.000004).toFixed(4)}`);
  console.log(`Processing in batches of ${BATCH_SIZE}...\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    
    console.log(`[${batchNum}/${totalBatches}] Processing batch of ${batch.length} products...`);
    
    try {
      const embeddings = await generateEmbeddingsBatch(batch);
      
      // Update database
      for (let j = 0; j < batch.length; j++) {
        try {
          await sql`
            UPDATE products
            SET embedding = ${JSON.stringify(embeddings[j])}::vector
            WHERE id = ${batch[j].id}
          `;
          successCount++;
        } catch (err) {
          console.error(`  ⚠️  Failed to update product ${batch[j].id}:`, err.message);
          errorCount++;
        }
      }
      
      console.log(`  ✅ Batch ${batchNum} completed (${successCount} total)\n`);
      
    } catch (error) {
      console.error(`  ❌ Batch ${batchNum} failed:`, error.message);
      errorCount += batch.length;
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📦 Total: ${rows.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (errorCount === 0) {
    console.log('🎉 All embeddings generated successfully!');
  } else {
    console.log(`⚠️  Completed with ${errorCount} errors`);
  }
}

generateAllEmbeddings()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });

