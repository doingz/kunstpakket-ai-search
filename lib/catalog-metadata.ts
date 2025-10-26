/**
 * Catalog Metadata - Central source of truth for AI prompts
 * This file loads real catalog data (brands, types, categories, themes)
 * and provides it to the AI for accurate parsing.
 */

import fs from 'fs';
import path from 'path';

interface Brand {
  id: number;
  title: string;
}

interface Category {
  id: number;
  title: string;
}

interface CatalogMetadata {
  brands: string[];
  productTypes: string[];
  categories: string[];
  popularThemes: string[];
  categoryMap: Map<number, string>;
}

let cachedMetadata: CatalogMetadata | null = null;

/**
 * Load and cache catalog metadata
 */
export function getCatalogMetadata(): CatalogMetadata {
  if (cachedMetadata) {
    return cachedMetadata;
  }

  try {
    // Load brands from data/brands.json
    const brandsPath = path.join(process.cwd(), 'data', 'brands.json');
    console.log(`[Catalog] Loading brands from: ${brandsPath}`);
    const brands: Brand[] = JSON.parse(fs.readFileSync(brandsPath, 'utf-8'));
    const brandNames = brands.map(b => b.title).sort();
    console.log(`[Catalog] Loaded ${brandNames.length} brands`);

    // Load categories from data/categories.json
    const categoriesPath = path.join(process.cwd(), 'data', 'categories.json');
    const categoriesData: Category[] = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8'));
    const categoryNames = categoriesData.map(c => c.title).sort();
    const categoryMap = new Map(categoriesData.map(c => [c.id, c.title]));
    console.log(`[Catalog] Loaded ${categoryNames.length} categories`);

    // Load product types from data/product-types.json (generated from database)
    const typesPath = path.join(process.cwd(), 'data', 'product-types.json');
    const productTypes: string[] = JSON.parse(fs.readFileSync(typesPath, 'utf-8'));
    console.log(`[Catalog] Loaded ${productTypes.length} product types`);

    // Load popular themes from data/themes.json (curated list for search)
    const themesPath = path.join(process.cwd(), 'data', 'themes.json');
    const popularThemes: string[] = JSON.parse(fs.readFileSync(themesPath, 'utf-8'));
    console.log(`[Catalog] Loaded ${popularThemes.length} themes`);

    cachedMetadata = {
      brands: brandNames,
      productTypes,
      categories: categoryNames,
      popularThemes,
      categoryMap
    };

    console.log(`[Catalog] ✅ All catalog data loaded successfully`);
    return cachedMetadata;
    
  } catch (error: any) {
    console.error('[Catalog] ❌ Failed to load catalog data:', error.message);
    console.error('[Catalog] Stack:', error.stack);
    throw new Error(`Failed to load catalog metadata: ${error.message}`);
  }
}

/**
 * Get category name by ID
 * Returns the category title or "Unknown (ID)" if not found
 */
export function getCategoryName(id: number): string {
  const metadata = getCatalogMetadata();
  return metadata.categoryMap.get(id) || `Unknown (${id})`;
}

/**
 * Brand normalization map for common search variations
 * Maps lowercase search terms to exact brand names
 */
const BRAND_NORMALIZATIONS: Record<string, string> = {
  // Artists with multiple name variations
  'klimt': 'Gustav Klimt',
  'van gogh': 'Vincent van Gogh',
  'gogh': 'Vincent van Gogh',
  'monet': 'Claude Monet',
  'rodin': 'Auguste Rodin',
  'modigliani': 'Amedeo Clemente Modigliani',
  'escher': 'Escher',
  'dali': 'Salvador Dali',
  'vermeer': 'Johannes Vermeer',
  'mondriaan': 'Piet Mondriaan',
  'bosch': 'Jheronimus Bosch',
  'jeroen bosch': 'Jheronimus Bosch',
  'degas': 'Edgar Degas',
  'renoir': 'Pierre-Auguste Renoir',
  'hokusai': 'Katsushika Hokusai',
  'corneille': 'Corneille',
  'claudel': 'Camille Claudel',
  'pompon': 'François Pompon',
  
  // Contemporary artists/designers
  'jeff koons': 'Jeff Koons',
  'koons': 'Jeff Koons',
  'herman brood': 'Herman Brood',
  'brood': 'Herman Brood',
  'orlinski': 'Richard Orlinski',
  'forchino': 'Guillermo Forchino beelden',
  'kokeshi': 'Kokeshi dolls',
  'senatori': 'Selwyn Senatori',
  
  // Dutch artists
  'ammerlaan': 'Corry Ammerlaan',
  'corry ammerlaan': 'Corry Ammerlaan',
  'tankeren': 'Ger van Tankeren',
  'van tankeren': 'Ger van Tankeren',
  'donkersloot': 'Peter Donkersloot',
  'gubbels': 'Klaas Gubbels',
  'klaas gubbels': 'Klaas Gubbels',
  'zegers': 'Jacky Zegers',
  'liemburg': 'Jack Liemburg',
  'gerritz': 'Harrie Gerritz',
  'kostermans': 'Tos Kostermans',
  'krabbé': 'Jeroen Krabbé',
  'krabbe': 'Jeroen Krabbé',
  
  // Brands
  'bosa': 'Bosa keramiek',
  'elephant parade': 'Elephant Parade'
};

/**
 * Generate brand normalization rules for AI prompt
 * Dynamically creates rules from the normalization map
 */
export function getBrandNormalizationRules(): string {
  const rules: string[] = [];
  const processed = new Set<string>();
  
  // Group variations by target brand
  const brandGroups = new Map<string, string[]>();
  
  for (const [key, value] of Object.entries(BRAND_NORMALIZATIONS)) {
    if (!brandGroups.has(value)) {
      brandGroups.set(value, []);
    }
    brandGroups.get(value)!.push(`"${key}"`);
  }
  
  // Format as AI prompt rules
  for (const [brand, variations] of brandGroups) {
    if (variations.length === 1) {
      rules.push(`${variations[0]} → "${brand}"`);
    } else {
      rules.push(`${variations.join(' / ')} → "${brand}"`);
    }
  }
  
  return rules.join('\n  ');
}

/**
 * Normalize a brand name for search
 * Returns the exact brand name if a normalization exists, otherwise returns the input
 */
export function normalizeBrand(input: string): string {
  const normalized = BRAND_NORMALIZATIONS[input.toLowerCase().trim()];
  return normalized || input;
}

/**
 * Build complete AI prompt instructions with dynamic catalog data
 */
export function buildPromptInstructions(): string {
  const metadata = getCatalogMetadata();
  
  return `
CRITICAL RULES FOR KEYWORD EXTRACTION:
- IGNORE generic words: "cadeau", "geschenk", "iets", "mooi", "leuk", "voor", "mijn", "zus", "broer", "vader", "moeder", "oma", "opa", "vriend", "vriendin"
- ONLY extract specific, searchable terms (themes, materials, colors, styles, occasions)
- IMPORTANT: "keramiek", "keramieken beeld", "ballonhond" → productType: "Beeld" (ceramics are sculptures)
- DO NOT add product types as keywords
- For artist/designer names: extract to 'artist' field (NOT keywords!). Use full normalized name.
- For animals: add common synonyms AND English translations (e.g. "kat" → ["kat", "poes", "cat"], "hond" → ["hond", "honden", "dog"], "paard" → ["paard", "paarden", "horse"])
- For occasions: use broader terms (e.g. "huwelijkscadeau" → ["huwelijk", "trouwen"], "bedankje" → ["bedanken", "dank"])

EXACT BRANDS IN CATALOG (these are the ONLY valid artist values - extract exact match to 'artist' field):
${metadata.brands.map(b => `  * ${b}`).join('\n')}

BRAND NORMALIZATION RULES (map user input to exact brand name):
  ${getBrandNormalizationRules()}

VALID PRODUCT TYPES (only use these exact values):
${metadata.productTypes.map(t => `  * ${t}`).join('\n')}

IMPORTANT CATEGORIES:
${metadata.categories.map(c => `  * ${c}`).join('\n')}

POPULAR THEMES IN CATALOG (for keyword extraction):
${metadata.popularThemes.map(t => `  * ${t}`).join('\n')}
  `.trim();
}

/**
 * Get catalog summary for AI advice messages
 */
export function getCatalogSummary(): string {
  const metadata = getCatalogMetadata();
  
  return `
Our product catalog:
- Types: ${metadata.productTypes.join(', ')}
- Popular themes: ${metadata.popularThemes.slice(0, 20).join(', ')}
- Top artists: Vincent van Gogh, Gustav Klimt, Claude Monet, Salvador Dali, Jeff Koons, Herman Brood, Kokeshi dolls, Guillermo Forchino
- Categories: ${metadata.categories.slice(0, 6).join(', ')}
  `.trim();
}

