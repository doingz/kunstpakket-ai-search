/**
 * Generate embeddings for all products with AI SDK
 * Much faster and more reliable than raw OpenAI
 */
import 'dotenv/config';
import { sql } from '@vercel/postgres';
import { generateEmbeddingsBatch } from '../lib/generate-embeddings.js';

const BATCH_SIZE = 100;

async function main() {
  console.log('🔮 Generating embeddings with AI SDK...\n');
  
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
  
  console.log(`Found ${rows.length} products`);
  console.log(`Cost: ~€${(rows.length * 0.000004).toFixed(4)}\n`);
  
  let success = 0;
  let errors = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    
    console.log(`[${batchNum}/${totalBatches}] Processing ${batch.length} products...`);
    
    try {
      const embeddings = await generateEmbeddingsBatch(batch);
      
      for (let j = 0; j < batch.length; j++) {
        try {
          await sql`
            UPDATE products
            SET embedding = ${JSON.stringify(embeddings[j])}::vector
            WHERE id = ${batch[j].id}
          `;
          success++;
        } catch (err) {
          console.error(`  ⚠️  Product ${batch[j].id} failed:`, err.message);
          errors++;
        }
      }
      
      console.log(`  ✅ Done (${success} total)\n`);
    } catch (error) {
      console.error(`  ❌ Batch failed:`, error.message);
      errors += batch.length;
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Errors: ${errors}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (errors === 0) {
    console.log('🎉 All done!');
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal:', err);
    process.exit(1);
  });

