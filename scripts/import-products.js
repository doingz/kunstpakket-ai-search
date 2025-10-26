/**
 * Import products from Lightspeed data and generate embeddings
 * Run with: npm run import
 */
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import dotenv from 'dotenv';
import { detectType } from '../lib/type-detector.js';

dotenv.config();

const startTime = Date.now();

// Read Lightspeed sync data
console.log('📖 Reading data files...');
const products = JSON.parse(fs.readFileSync('data/products.json', 'utf-8'));
const variants = JSON.parse(fs.readFileSync('data/variants.json', 'utf-8'));
const categories = JSON.parse(fs.readFileSync('data/categories.json', 'utf-8'));
const categoriesProducts = JSON.parse(fs.readFileSync('data/categories-products.json', 'utf-8'));

console.log(`   Products: ${products.length}`);
console.log(`   Variants: ${variants.length}`);
console.log(`   Categories: ${categories.length}`);
console.log(`   Category mappings: ${categoriesProducts.length}`);
console.log('');

// Build variant map (productId -> default variant with price)
const variantMap = new Map();
variants.forEach(variant => {
  const productId = variant.product?.resource?.id;
  if (productId && variant.isDefault) {
    variantMap.set(productId, {
      priceExcl: parseFloat(variant.priceExcl) || 0,
      oldPriceExcl: variant.oldPriceExcl ? parseFloat(variant.oldPriceExcl) : null,
      stockSold: variant.stockSold || 0
    });
  }
});

console.log(`✅ Mapped ${variantMap.size} default variants with prices`);
console.log('');

// Build category map (categoryId -> category name)
const categoryMap = new Map();
categories.forEach(cat => {
  categoryMap.set(cat.id, cat.title);
});
console.log(`✅ Mapped ${categoryMap.size} categories`);
console.log('');

// Load brands data
const brandsData = JSON.parse(fs.readFileSync('data/brands.json', 'utf-8'));
const brandMap = new Map();
brandsData.forEach(brand => {
  brandMap.set(brand.id, brand.title);
});
console.log(`✅ Mapped ${brandMap.size} brands`);
console.log('');

// Build embedding text from product data
function buildEmbeddingText(product) {
  // Get category names for this product
  const productCategoryIds = categoriesProducts
    .filter(cp => cp.product.resource.id === product.id)
    .map(cp => cp.category.resource.id);
  
  const categoryNames = productCategoryIds
    .map(id => categoryMap.get(id))
    .filter(Boolean);
  
  // Get brand name from brand map
  const brandName = product.brand?.resource?.id 
    ? brandMap.get(product.brand.resource.id)
    : null;
  
  const parts = [
    product.title,
    product.fulltitle,
    product.description?.replace(/<[^>]*>/g, ''), // Strip HTML
    product.content?.replace(/<[^>]*>/g, ''), // Include content for artist info!
    brandName, // Use real brand name from Lightspeed!
    ...categoryNames // Add category names to embedding!
  ].filter(Boolean);
  
  return parts.join(' ').trim();
}

// Get artist/brand name from Lightspeed brand data
function getArtist(product) {
  if (!product.brand?.resource?.id) {
    return null;
  }
  
  // Look up brand name in brand map
  return brandMap.get(product.brand.resource.id) || null;
}

// Extract dimensions from product data
function extractDimensions(product) {
  const text = [
    product.description?.replace(/<[^>]*>/g, ''),
    product.content?.replace(/<[^>]*>/g, '')
  ].filter(Boolean).join(' ');
  
  // Common dimension patterns (Dutch)
  const patterns = [
    // "160 x 120 cm", "100 x 100 x 50 cm"
    /\b(\d+\s*x\s*\d+(?:\s*x\s*\d+)?)\s*cm\b/i,
    // "Hoogte 24 cm", "Diameter 30 cm", "Breedte 50 cm"
    /(?:hoogte|diameter|breedte|lengte|afmeting)[:\s]*(\d+(?:,\d+)?)\s*cm/i,
    // "Afmetingen: 100 x 100 cm"
    /afmetingen?[:\s]*(\d+\s*x\s*\d+(?:\s*x\s*\d+)?)\s*cm/i,
    // Just "24 cm" or "24,5 cm" (with some context)
    /(?:circa|ca\.?|ongeveer)?\s*(\d+(?:,\d+)?)\s*cm(?:\s+hoog)?/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let dimension = match[1].trim();
      // Normalize: replace comma with dot, ensure "cm" suffix
      dimension = dimension.replace(',', '.');
      // If it's just a number, add " cm" (for consistency)
      if (!/\d\s*x\s*\d/.test(dimension) && !dimension.endsWith('cm')) {
        dimension = dimension + ' cm';
      }
      return dimension;
    }
  }
  
  return null;
}

// Get categories for a product
function getProductCategories(productId) {
  return categoriesProducts
    .filter(cp => cp.product.resource.id === productId)
    .map(cp => cp.category.resource.id);
}

// Process in batches to avoid rate limits
async function processBatch(batch, batchNum, totalBatches) {
  console.log(`\n🔄 Batch ${batchNum}/${totalBatches} (${batch.length} products)`);
  
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
    
    let inserted = 0;
    let updated = 0;
    
    // Insert products with embeddings
    for (let i = 0; i < batch.length; i++) {
      const product = batch[i];
      const embedding = embeddings[i];
      const variant = variantMap.get(product.id) || { priceExcl: 0, oldPriceExcl: null, stockSold: 0 };
      const productType = detectType(product);
      const artist = getArtist(product);
      const dimensions = extractDimensions(product);
      
      // Check if product exists
      const existing = await sql`SELECT id FROM products WHERE id = ${product.id}`;
      const isUpdate = existing.rows.length > 0;
      
      if (isUpdate) {
        // Update existing product
        await sql`
          UPDATE products SET
            title = ${product.title},
            full_title = ${product.fulltitle || product.title},
            description = ${product.description || ''},
            content = ${product.content || ''},
            url = ${product.url},
            brand = ${product.brand?.title || null},
            artist = ${artist},
            dimensions = ${dimensions},
            price = ${variant.priceExcl},
            old_price = ${variant.oldPriceExcl},
            is_visible = ${product.isVisible},
            image = ${product.image?.src || null},
            stock_sold = ${variant.stockSold},
            type = ${productType},
            embedding = ${JSON.stringify(embedding)}::vector,
            updated_at = NOW()
          WHERE id = ${product.id}
        `;
        updated++;
      } else {
        // Insert new product
        await sql`
          INSERT INTO products (
            id, title, full_title, description, content, url, 
            brand, artist, dimensions, price, old_price, is_visible, image, stock_sold, type,
            embedding
          )
          VALUES (
            ${product.id},
            ${product.title},
            ${product.fulltitle || product.title},
            ${product.description || ''},
            ${product.content || ''},
            ${product.url},
            ${product.brand?.title || null},
            ${artist},
            ${dimensions},
            ${variant.priceExcl},
            ${variant.oldPriceExcl},
            ${product.isVisible},
            ${product.image?.src || null},
            ${variant.stockSold},
            ${productType},
            ${JSON.stringify(embedding)}::vector
          )
        `;
        inserted++;
      }
      
      // Insert categories
      const categories = getProductCategories(product.id);
      for (const categoryId of categories) {
        await sql`
          INSERT INTO product_categories (product_id, category_id)
          VALUES (${product.id}, ${categoryId})
          ON CONFLICT (product_id, category_id) DO NOTHING
        `;
      }
    }
    
    console.log(`  ✅ Batch complete! (${inserted} new, ${updated} updated)`);
    
  } catch (error) {
    console.error(`  ❌ Batch ${batchNum} failed:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('📦 Starting import...\n');
  
  // Filter visible products only
  const visibleProducts = products.filter(p => p.isVisible);
  const hiddenCount = products.length - visibleProducts.length;
  
  console.log(`✅ Importing ${visibleProducts.length} visible products`);
  console.log(`   (${hiddenCount} hidden products skipped)`);
  console.log('');
  
  const BATCH_SIZE = 50;
  const batches = [];
  
  for (let i = 0; i < visibleProducts.length; i += BATCH_SIZE) {
    batches.push(visibleProducts.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`📊 Processing ${batches.length} batches of ${BATCH_SIZE} products`);
  
  // Process all batches
  for (let i = 0; i < batches.length; i++) {
    await processBatch(batches[i], i + 1, batches.length);
  }
  
  // Final stats
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Import complete in ${duration}s!`);
  
  const stats = await sql`
    SELECT 
      COUNT(*) as total,
      COUNT(embedding) as with_embeddings,
      COUNT(CASE WHEN price > 0 THEN 1 END) as with_price,
      AVG(price) as avg_price,
      MAX(price) as max_price
    FROM products
  `;
  
  const s = stats.rows[0];
  console.log(`\n📊 Database stats:`);
  console.log(`   Total products: ${s.total}`);
  console.log(`   With embeddings: ${s.with_embeddings}`);
  console.log(`   With price > 0: ${s.with_price}`);
  console.log(`   Average price: €${parseFloat(s.avg_price || 0).toFixed(2)}`);
  console.log(`   Max price: €${parseFloat(s.max_price || 0).toFixed(2)}`);
  console.log('');
}

main()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Import failed:', err);
    process.exit(1);
  });
