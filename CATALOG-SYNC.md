# Catalog Sync Workflow

This document describes how to keep the AI search system up-to-date with the latest catalog data.

## 🔄 When to Run Sync

Run the sync scripts when:
- New brands are added to Lightspeed
- Product categories change
- New product types are introduced
- Preparing for deployment to a new webshop

## 📊 Sync Scripts

### 1. Fetch Brands (`fetch-brands.mjs`)
Fetches all brand data from Lightspeed and saves to `data/brands.json`.

```bash
node scripts/fetch-brands.mjs
```

**Output**: `data/brands.json` with all brand IDs and names.

### 2. Fetch Categories (`fetch-categories.mjs`)
Fetches all category data from Lightspeed and saves to `data/categories.json`.

```bash
node scripts/fetch-categories.mjs
```

**Output**: `data/categories.json` with all category IDs and names.

### 3. Fetch Product Types (`fetch-product-types.mjs`)
Extracts distinct product types from the database and saves to `data/product-types.json`.

```bash
node scripts/fetch-product-types.mjs
```

**Output**: `data/product-types.json` with all product types sorted by frequency.

### 4. Import Products (`import-products.js`)
Imports products from Lightspeed, generates embeddings, and detects types.

```bash
node scripts/import-products.js
```

**Note**: Run this AFTER fetching brands, as it uses `data/brands.json` for artist lookup.

## 🚀 Complete Sync Workflow

For a fresh start or after major catalog changes:

```bash
# 1. Fetch catalog metadata
node scripts/fetch-brands.mjs
node scripts/fetch-categories.mjs

# 2. Import products (uses brands data)
node scripts/import-products.js

# 3. Extract product types from database
node scripts/fetch-product-types.mjs

# 4. Deploy to Vercel
git add data/*.json
git commit -m "chore: update catalog data"
git push origin main
```

## 📁 Data Files

All catalog data is stored in `data/` directory:

| File | Source | Update Frequency |
|------|--------|------------------|
| `brands.json` | Lightspeed API | When brands change |
| `categories.json` | Lightspeed API | When categories change |
| `product-types.json` | Database | After product import |
| `themes.json` | Curated/Manual | Rarely (search keywords) |

## 🔍 How It Works

### Catalog Metadata (`lib/catalog-metadata.ts`)

This file is the **single source of truth** for all catalog data. It:

1. **Loads dynamic data** from JSON files on startup
2. **Caches data** in memory for performance
3. **Provides helper functions**:
   - `getCatalogMetadata()` - Returns all metadata
   - `getCategoryName(id)` - Category ID → name lookup
   - `normalizeBrand(input)` - Normalize brand search terms
   - `buildPromptInstructions()` - AI prompt with real catalog data
   - `getCatalogSummary()` - Catalog summary for AI advice

### Search API (`api/search.ts`)

Uses the catalog metadata for:
- AI filter parsing (knows all valid brands/types/categories)
- Category name display in results
- Dynamic similarity thresholds
- Advice message generation

### Brand Normalization

The system includes intelligent brand normalization:

```typescript
// User searches for:
"klimt" → "Gustav Klimt"
"van gogh" → "Vincent van Gogh"  
"forchino" → "Guillermo Forchino beelden"
"kokeshi" → "Kokeshi dolls"
```

Add new normalizations in `lib/catalog-metadata.ts` → `BRAND_NORMALIZATIONS`.

## 🌍 Multi-Site Deployment

For deploying to multiple webshops:

1. **Clone repository** for new site
2. **Update `.env`** with site-specific Lightspeed credentials
3. **Run complete sync workflow** (see above)
4. **Deploy to Vercel** with site-specific environment variables

The same codebase works for all sites - only the data files differ!

## ⚠️ Important Notes

- **Always fetch brands BEFORE importing products** (import needs brand data)
- **Themes are curated** (`data/themes.json`) - edit manually for best search results
- **Restart Vercel functions** after updating data files (automatic on git push)
- **Cache is per-process** - each serverless function instance caches independently

## 🔧 Troubleshooting

### "Missing catalog data file"
Run the appropriate fetch script to generate the missing file.

### "Category not found"
Run `fetch-categories.mjs` to update category data.

### "Brand mismatch"
1. Check `data/brands.json` has latest Lightspeed data
2. Re-import products with `import-products.js`

### "Types out of sync"
Run `fetch-product-types.mjs` after product changes to extract latest types from database.

