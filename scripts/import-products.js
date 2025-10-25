/**
 * Import products from Lightspeed data and generate embeddings
 * Run with: node scripts/import-products.js
 */
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Read Lightspeed sync data
const products = JSON.parse(fs.readFileSync('data/products.json', 'utf-8'));
const categoriesProducts = JSON.parse(fs.readFileSync('data/categories-products.json', 'utf-8'));

console.log(`📦 Found ${products.length} products to import`);

// Build embedding text from product data
function buildEmbeddingText(product) {
  const parts = [
    product.title,
    product.fulltitle,
    product.description?.replace(/<[^>]*>/g, ''), // Strip HTML
  ].filter(Boolean);
  
  return parts.join(' ').trim();
}

// Get categories for a product
function getProductCategories(productId) {
  return categoriesProducts
    .filter(cp => cp.product.id === productId)
    .map(cp => cp.category.id);
}

// Process in batches to avoid rate limits
async function processBatch(batch, batchNum, totalBatches) {
  console.log(`\n🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} products)`);
  
  try {
    // Generate embeddings for this batch
    const texts = batch.map(buildEmbeddingText);
    console.log(`  ⏳ Generating embeddings...`);
    
    const { embeddings } = await embedMany({
      model: openai.embedding('text-embedding-3-small'),
      values: texts
    });
    
    console.log(`  ✅ Generated ${embeddings.length} embeddings`);
    console.log(`  💾 Inserting into database...`);
    
    // Insert products with embeddings
    for (let i = 0; i < batch.length; i++) {
      const product = batch[i];
      const embedding = embeddings[i];
      
      // Insert product (using existing schema with 'brand' column)
      await sql`
        INSERT INTO products (
          id, title, full_title, description, content, url, 
          brand, price, old_price, is_visible, image, stock_sold,
          embedding
        )
        VALUES (
          ${product.id},
          ${product.title},
          ${product.fulltitle || product.title},
          ${product.description || ''},
          ${product.content || ''},
          ${product.url},
          ${product.brand?.resource?.id || null},
          ${parseFloat(product.priceExcl) || 0},
          ${product.oldPriceExcl ? parseFloat(product.oldPriceExcl) : null},
          ${product.isVisible},
          ${product.image?.src || null},
          ${product.stockSold || 0},
          ${JSON.stringify(embedding)}::vector
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          full_title = EXCLUDED.full_title,
          description = EXCLUDED.description,
          content = EXCLUDED.content,
          url = EXCLUDED.url,
          brand = EXCLUDED.brand,
          price = EXCLUDED.price,
          old_price = EXCLUDED.old_price,
          is_visible = EXCLUDED.is_visible,
          image = EXCLUDED.image,
          stock_sold = EXCLUDED.stock_sold,
          embedding = EXCLUDED.embedding,
          updated_at = NOW()
      `;
      
      // Insert categories
      const categories = getProductCategories(product.id);
      for (const categoryId of categories) {
        await sql`
          INSERT INTO product_categories (product_id, category_id)
          VALUES (${product.id}, ${categoryId})
          ON CONFLICT DO NOTHING
        `;
      }
    }
    
    console.log(`  ✅ Batch ${batchNum} complete!`);
  } catch (error) {
    console.error(`  ❌ Error in batch ${batchNum}:`, error.message);
    throw error;
  }
}

// Main import function
async function importProducts() {
  const BATCH_SIZE = 50;
  const batches = [];
  
  // Only import visible products
  const visibleProducts = products.filter(p => p.isVisible);
  console.log(`✅ Importing ${visibleProducts.length} visible products (${products.length - visibleProducts.length} hidden skipped)`);
  
  // Split into batches
  for (let i = 0; i < visibleProducts.length; i += BATCH_SIZE) {
    batches.push(visibleProducts.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`📊 Created ${batches.length} batches of ${BATCH_SIZE} products each\n`);
  
  const startTime = Date.now();
  
  // Process batches sequentially to avoid rate limits
  for (let i = 0; i < batches.length; i++) {
    await processBatch(batches[i], i + 1, batches.length);
    
    // Small delay between batches to be nice to the API
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Import complete! ${visibleProducts.length} products imported in ${elapsed}s`);
  
  // Show stats
  const stats = await sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
      AVG(price) as avg_price
    FROM products
    WHERE is_visible = true
  `;
  
  console.log(`\n📊 Database stats:`);
  console.log(`   Total products: ${stats.rows[0].total}`);
  console.log(`   With embeddings: ${stats.rows[0].with_embeddings}`);
  console.log(`   Average price: €${parseFloat(stats.rows[0].avg_price).toFixed(2)}`);
}

// Run import
importProducts()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });

