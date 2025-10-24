/**
 * Detect product type from title, description, tags, and category
 * Types: Beeld, Schilderij, Vaas, Mok, Wandbord, Schaal, Glasobject
 * 
 * NOTE: "Cadeau" is NOT a product type - it's a user intention!
 */

// Type detection patterns
// Order matters: specific types first, broad types last
const TYPE_PATTERNS = {
  // Specific product types first (high priority)
  Mok: {
    titleKeywords: ['mok', 'beker', 'koffiemok', 'theemok', 'cup', 'mug'],
    categories: ['mok', 'mokken']
  },
  Vaas: {
    titleKeywords: ['vaas', 'vazen', 'vase', 'bloemenvaas'],
    categories: ['vaas', 'vazen']
  },
  Schaal: {
    titleKeywords: ['schaal', 'schalen', 'bowl', 'kom'],
    categories: ['schaal', 'schalen']
  },
  Wandbord: {
    titleKeywords: ['wandbord', 'bord', 'decoratief bord', 'plate'],
    categories: ['wandbord']
  },
  Glasobject: {
    titleKeywords: ['glasobject', 'glazen', 'glas kunst', 'kristal'],
    categories: ['glas']
  },
  // Broad types last (lower priority)
  Beeld: {
    titleKeywords: ['beeld', 'beeldje', 'sculptuur', 'sculpture', 'statue', 'bronzen', 'brons'],
    categories: ['beeld']
  },
  Schilderij: {
    titleKeywords: ['schilderij', 'schildering', 'painting', 'giclee', 'giclée', 'print', 'prent', 'zeefdruk'],
    categories: ['schilderij']
  }
  // NOTE: Cadeau is NOT included - it's not a product type!
};

/**
 * Detect product type from title and category
 * Priority: title keywords (exact) > category
 * 
 * Title keywords are checked FIRST for all types before checking categories
 * This prevents "Mok Monet" from being classified as Schilderij
 */
export function detectProductType(product) {
  const title = (product.title || '').toLowerCase();
  const categories = (product.categories || []).map(c => c.toLowerCase());
  
  // Pass 1: Check title keywords for ALL types (most reliable)
  // This ensures "mok" in title wins over "monet" (artist name)
  for (const [type, patterns] of Object.entries(TYPE_PATTERNS)) {
    if (patterns.titleKeywords && patterns.titleKeywords.length > 0) {
      // Check if title starts with or contains the keyword as a separate word
      const titleWords = title.split(/\s+/);
      if (patterns.titleKeywords.some(kw => 
        title.startsWith(kw + ' ') || 
        title.startsWith(kw) ||
        titleWords.includes(kw)
      )) {
        return type;
      }
    }
  }
  
  // Pass 2: Check categories
  for (const [type, patterns] of Object.entries(TYPE_PATTERNS)) {
    if (patterns.categories.some(cat => categories.some(c => c.includes(cat)))) {
      return type;
    }
  }
  
  return null; // Unable to detect type
}

/**
 * Get all product types
 */
export function getAllTypes() {
  return Object.keys(TYPE_PATTERNS);
}

/**
 * Validate if a type is valid
 */
export function isValidType(type) {
  return TYPE_PATTERNS.hasOwnProperty(type);
}

