#!/usr/bin/env node
/**
 * Import Lightspeed JSON data to Neon database
 * Reads data/*.json and inserts into Postgres
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../lib/db.js';
import { detectProductType } from '../lib/type-detector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

/**
 * Read and parse JSON file
 */
async function readJsonFile(filename) {
  const filePath = path.join(dataDir, filename);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Could not read ${filename}:`, error.message);
    return null;
  }
}

/**
 * Import products (without price - price comes from variants)
 */
async function importProducts(products) {
  console.log(`\n📦 Importing ${products.length} products...`);
  
  let imported = 0;
  let skipped = 0;

  for (const product of products) {
    try {
      await sql`
        INSERT INTO products (
          id, title, full_title, content, brand, price, image, url, 
          is_visible, created_at, updated_at
        ) VALUES (
          ${product.id},
          ${product.title || ''},
          ${product.fulltitle || null},
          ${product.content || null},
          ${product.brand?.resource?.id || null},
          ${null},
          ${product.image?.src || null},
          ${product.url || null},
          ${product.isVisible !== false},
          ${product.createdAt || null},
          ${product.updatedAt || null}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          full_title = EXCLUDED.full_title,
          content = EXCLUDED.content,
          brand = EXCLUDED.brand,
          image = EXCLUDED.image,
          url = EXCLUDED.url,
          is_visible = EXCLUDED.is_visible,
          updated_at = EXCLUDED.updated_at
      `;
      imported++;
      
      if (imported % 100 === 0) {
        console.log(`  ⏳ Imported ${imported}/${products.length}...`);
      }
    } catch (error) {
      console.error(`  ⚠️  Product ${product.id} failed:`, error.message);
      skipped++;
    }
  }

  console.log(`✅ Products: ${imported} imported, ${skipped} skipped`);
  return imported;
}

/**
 * Import tags
 */
async function importTags(tags) {
  console.log(`\n🏷️  Importing ${tags.length} tags...`);
  
  let imported = 0;
  
  for (const tag of tags) {
    try {
      await sql`
        INSERT INTO tags (id, title)
        VALUES (${tag.id}, ${tag.title})
        ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
      `;
      imported++;
    } catch (error) {
      console.error(`  ⚠️  Tag ${tag.id} failed:`, error.message);
    }
  }

  console.log(`✅ Tags: ${imported} imported`);
  return imported;
}

/**
 * Import categories
 */
async function importCategories(categories) {
  console.log(`\n📂 Importing ${categories.length} categories...`);
  
  let imported = 0;
  
  for (const category of categories) {
    try {
      await sql`
        INSERT INTO categories (id, title, parent_id, url)
        VALUES (
          ${category.id},
          ${category.title},
          ${category.parent || null},
          ${category.url || null}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          parent_id = EXCLUDED.parent_id,
          url = EXCLUDED.url
      `;
      imported++;
    } catch (error) {
      console.error(`  ⚠️  Category ${category.id} failed:`, error.message);
    }
  }

  console.log(`✅ Categories: ${imported} imported`);
  return imported;
}

/**
 * Import product-tag relations
 */
async function importProductTags(relations) {
  console.log(`\n🔗 Importing ${relations.length} product-tag relations...`);
  
  let imported = 0;
  let skipped = 0;

  for (const rel of relations) {
    try {
      const productId = rel.product?.resource?.id;
      const tagId = rel.tag?.resource?.id;
      
      if (!productId || !tagId) {
        skipped++;
        continue;
      }
      
      await sql`
        INSERT INTO product_tags (product_id, tag_id)
        VALUES (${productId}, ${tagId})
        ON CONFLICT (product_id, tag_id) DO NOTHING
      `;
      imported++;
      
      if (imported % 500 === 0) {
        console.log(`  ⏳ Imported ${imported}/${relations.length}...`);
      }
    } catch (error) {
      // Skip if product or tag doesn't exist
      skipped++;
    }
  }

  console.log(`✅ Product-Tags: ${imported} imported, ${skipped} skipped`);
  return imported;
}

/**
 * Import product-category relations
 */
async function importProductCategories(relations) {
  console.log(`\n🔗 Importing ${relations.length} product-category relations...`);
  
  let imported = 0;
  let skipped = 0;

  for (const rel of relations) {
    try {
      const productId = rel.product?.resource?.id;
      const categoryId = rel.category?.resource?.id;
      
      if (!productId || !categoryId) {
        skipped++;
        continue;
      }
      
      await sql`
        INSERT INTO product_categories (product_id, category_id)
        VALUES (${productId}, ${categoryId})
        ON CONFLICT (product_id, category_id) DO NOTHING
      `;
      imported++;
      
      if (imported % 500 === 0) {
        console.log(`  ⏳ Imported ${imported}/${relations.length}...`);
      }
    } catch (error) {
      skipped++;
    }
  }

  console.log(`✅ Product-Categories: ${imported} imported, ${skipped} skipped`);
  return imported;
}

/**
 * Import variants and update product prices
 */
async function importVariants(variants) {
  console.log(`\n🎨 Importing ${variants.length} variants...`);
  
  let imported = 0;
  let skipped = 0;
  let pricesUpdated = 0;

  for (const variant of variants) {
    try {
      // Import variant
      await sql`
        INSERT INTO variants (id, product_id, title, sku, price, stock)
        VALUES (
          ${variant.id},
          ${variant.product?.resource?.id || null},
          ${variant.title || null},
          ${variant.sku || null},
          ${variant.priceIncl || null},
          ${variant.stockLevel || 0}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          sku = EXCLUDED.sku,
          price = EXCLUDED.price,
          stock = EXCLUDED.stock
      `;
      
      // Update product price and stock_sold from default variant
      if (variant.isDefault && variant.product?.resource?.id) {
        await sql`
          UPDATE products 
          SET 
            price = COALESCE(price, ${variant.priceIncl || null}),
            stock_sold = ${variant.stockSold || 0}
          WHERE id = ${variant.product.resource.id}
        `;
        pricesUpdated++;
      }
      
      imported++;
      
      if (imported % 500 === 0) {
        console.log(`  ⏳ Imported ${imported}/${variants.length}...`);
      }
    } catch (error) {
      skipped++;
    }
  }

  console.log(`✅ Variants: ${imported} imported, ${skipped} skipped`);
  console.log(`✅ Product prices updated: ${pricesUpdated}`);
  return imported;
}

/**
 * Regenerate database-tags.js with latest tags
 */
async function regenerateTagList() {
  try {
    const tags = await sql`
      SELECT t.title
      FROM tags t
      LEFT JOIN product_tags pt ON t.id = pt.tag_id
      GROUP BY t.id, t.title
      HAVING COUNT(pt.product_id) > 0
      ORDER BY COUNT(pt.product_id) DESC
    `;
    
    const tagList = tags.rows.map(r => r.title);
    
    const content = `/**
 * All available tags from database
 * Auto-generated during sync - do not edit manually!
 * Last updated: ${new Date().toISOString()}
 */
export const ALL_DATABASE_TAGS = [
${tagList.map(tag => `  '${tag.replace(/'/g, "\\'")}',`).join('\n')}
];

// Total: ${tagList.length} tags
`;
    
    const tagFilePath = path.join(__dirname, '..', 'lib', 'database-tags.js');
    
    await fs.writeFile(tagFilePath, content, 'utf-8');
    
    console.log(`  ✅ Generated ${tagList.length} tags in lib/database-tags.js`);
    
  } catch (error) {
    console.error('  ⚠️  Failed to regenerate tag list:', error.message);
  }
}

/**
 * Detect and update product types based on title, description, tags, and categories
 */
async function detectAndUpdateTypes() {
  try {
    // Get all products with their tags and categories
    const products = await sql`
      SELECT 
        p.id,
        p.title,
        p.content,
        ARRAY_AGG(DISTINCT t.title) FILTER (WHERE t.title IS NOT NULL) as tags,
        ARRAY_AGG(DISTINCT c.title) FILTER (WHERE c.title IS NOT NULL) as categories
      FROM products p
      LEFT JOIN product_tags pt ON p.id = pt.product_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN product_categories pc ON p.id = pc.product_id
      LEFT JOIN categories c ON pc.category_id = c.id
      WHERE p.is_visible = true
      GROUP BY p.id, p.title, p.content
    `;
    
    let updated = 0;
    let undetected = 0;
    const typeCounts = {};
    
    for (const product of products.rows) {
      const detectedType = detectProductType(product);
      
      if (detectedType) {
        await sql`
          UPDATE products 
          SET type = ${detectedType}
          WHERE id = ${product.id}
        `;
        updated++;
        typeCounts[detectedType] = (typeCounts[detectedType] || 0) + 1;
      } else {
        undetected++;
      }
    }
    
    console.log(`  ✅ Updated ${updated} products with types:`);
    for (const [type, count] of Object.entries(typeCounts)) {
      console.log(`     ${type}: ${count}`);
    }
    if (undetected > 0) {
      console.log(`  ⚠️  ${undetected} products without detected type`);
    }
    
  } catch (error) {
    console.error('  ⚠️  Failed to detect types:', error.message);
  }
}

/**
 * Show import statistics
 */
async function showStats() {
  console.log('\n📊 Database statistics:');
  
  const stats = await sql`
    SELECT 
      (SELECT COUNT(*) FROM products) as products,
      (SELECT COUNT(*) FROM products WHERE is_visible = true) as visible_products,
      (SELECT COUNT(*) FROM tags) as tags,
      (SELECT COUNT(*) FROM categories) as categories,
      (SELECT COUNT(*) FROM product_tags) as product_tag_relations,
      (SELECT COUNT(*) FROM product_categories) as product_category_relations,
      (SELECT COUNT(*) FROM variants) as variants
  `;
  
  const s = stats.rows[0];
  console.log(`   Products: ${s.products} (${s.visible_products} visible)`);
  console.log(`   Tags: ${s.tags}`);
  console.log(`   Categories: ${s.categories}`);
  console.log(`   Product-Tag relations: ${s.product_tag_relations}`);
  console.log(`   Product-Category relations: ${s.product_category_relations}`);
  console.log(`   Variants: ${s.variants}`);
}

async function main() {
  console.log('🔄 Importing Lightspeed data to Neon...');
  console.log(`   Data directory: ${dataDir}`);
  
  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Check if data directory exists
  try {
    await fs.access(dataDir);
  } catch {
    console.error(`\n❌ Data directory not found: ${dataDir}`);
    console.error('   Run "npm run sync" first to download Lightspeed data');
    process.exit(1);
  }

  // Load all data files
  const [products, tags, categories, tagsProducts, categoriesProducts, variants] = await Promise.all([
    readJsonFile('products.json'),
    readJsonFile('tags.json'),
    readJsonFile('categories.json'),
    readJsonFile('tags-products.json'),
    readJsonFile('categories-products.json'),
    readJsonFile('variants.json')
  ]);

  // Validate required data
  if (!products || products.length === 0) {
    console.error('\n❌ No products found. Run "npm run sync" first.');
    process.exit(1);
  }

  // Import in correct order (parents before children)
  try {
    await importProducts(products);
    
    if (tags) await importTags(tags);
    if (categories) await importCategories(categories);
    if (variants) await importVariants(variants);
    
    if (tagsProducts) await importProductTags(tagsProducts);
    if (categoriesProducts) await importProductCategories(categoriesProducts);

    await showStats();
    
    // Detect and update product types
    console.log('\n🔍 Detecting product types...');
    await detectAndUpdateTypes();
    
    // Regenerate tag list for AI
    console.log('\n🔄 Regenerating tag list for AI...');
    await regenerateTagList();

    console.log('\n✅ Import complete!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

