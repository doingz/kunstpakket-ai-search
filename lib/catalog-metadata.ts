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

interface CatalogMetadata {
  brands: string[];
  productTypes: string[];
  categories: string[];
  popularThemes: string[];
}

let cachedMetadata: CatalogMetadata | null = null;

/**
 * Load and cache catalog metadata
 */
export function getCatalogMetadata(): CatalogMetadata {
  if (cachedMetadata) {
    return cachedMetadata;
  }

  // Load brands from data/brands.json
  const brandsPath = path.join(process.cwd(), 'data', 'brands.json');
  const brands: Brand[] = JSON.parse(fs.readFileSync(brandsPath, 'utf-8'));
  const brandNames = brands.map(b => b.title).sort();

  // Product types (from type-detector.js)
  const productTypes = [
    'Beeld',
    'Schilderij',
    'Vaas',
    'Mok',
    'Onderzetters',
    'Schaal',
    'Overig'
  ];

  // Top categories (manually curated based on importance)
  const categories = [
    'Moderne Kunstcadeaus',
    'Sportbeelden',
    'Zakelijke Geschenken',
    'Liefde & Huwelijk',
    'Bedankbeelden',
    'Jubileum & Afscheid',
    'Geslaagd & Examen',
    'Relatiegeschenken & Eindejaarsgeschenken',
    'Alle Bronzen & Moderne Beelden'
  ];

  // Popular themes (extracted from actual product catalog)
  const popularThemes = [
    'dieren', 'liefde', 'sport', 'muziek', 'bloemen', 'abstract',
    'natuur', 'gezin', 'familie', 'vriendschap', 'hart', 'boom',
    'vogel', 'kat', 'hond', 'olifant', 'paard', 'vis',
    'voetbal', 'golf', 'tennis', 'wielrennen', 'hardlopen',
    'zorg', 'verpleging', 'dokter', 'leraar', 'onderwijs',
    'zakelijk', 'team', 'samenwerking', 'succes', 'innovatie',
    'kunst', 'modern', 'klassiek', 'vintage', 'design'
  ];

  cachedMetadata = {
    brands: brandNames,
    productTypes,
    categories,
    popularThemes
  };

  return cachedMetadata;
}

/**
 * Generate brand normalization rules for AI prompt
 */
export function getBrandNormalizationRules(): string {
  const metadata = getCatalogMetadata();
  
  const rules = [
    '"klimt" → "Gustav Klimt"',
    '"van gogh" / "gogh" → "Vincent van Gogh"',
    '"forchino" → "Guillermo Forchino beelden"',
    '"kokeshi" → "Kokeshi dolls"',
    '"monet" → "Claude Monet"',
    '"rodin" → "Auguste Rodin"',
    '"modigliani" → "Amedeo Clemente Modigliani"',
    '"escher" → "Escher"',
    '"dali" → "Salvador Dali"',
    '"vermeer" → "Johannes Vermeer"',
    '"mondriaan" → "Piet Mondriaan"',
    '"jeff koons" / "koons" → "Jeff Koons"',
    '"herman brood" / "brood" → "Herman Brood"',
    '"bosch" / "jeroen bosch" → "Jheronimus Bosch"'
  ];

  return rules.join('\n  ');
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

