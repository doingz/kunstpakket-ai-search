/**
 * Detect product type from title, description, tags, and category
 * Types: Beeld, Schilderij, Vaas, Mok, Wandbord, Schaal, Glasobject, Cadeau
 */

const TYPE_PATTERNS = {
  Beeld: {
    keywords: ['beeld', 'beeldje', 'sculptuur', 'sculpture', 'statue', 'bronzen', 'brons'],
    tags: ['beeld', 'beeldje', 'sculptuur', 'bronzen beeld', 'modern beeld'],
    categories: ['beeld']
  },
  Schilderij: {
    keywords: ['schilderij', 'schildering', 'painting', 'giclee', 'giclée', 'print', 'prent', 'zeefdruk', 'kunst op doek', 'canvas', 'olieverf'],
    tags: ['schilderij', 'giclee', 'giclée', 'print', 'zeefdruk', 'kunst', 'doek'],
    categories: ['schilderij']
  },
  Vaas: {
    keywords: ['vaas', 'vazen', 'vase', 'bloemenvaas'],
    tags: ['vaas', 'vazen', 'bloemenvaas'],
    categories: ['vaas', 'vazen', 'schalen & vazen']
  },
  Mok: {
    keywords: ['mok', 'beker', 'koffiemok', 'theemok', 'cup', 'mug'],
    tags: ['mok', 'beker', 'koffiemok'],
    categories: ['mok', 'mokken']
  },
  Wandbord: {
    keywords: ['wandbord', 'bord', 'decoratief bord', 'plate'],
    tags: ['wandbord', 'bord'],
    categories: ['wandbord']
  },
  Schaal: {
    keywords: ['schaal', 'schalen', 'bowl', 'kom'],
    tags: ['schaal', 'schalen'],
    categories: ['schaal', 'schalen', 'schalen & vazen']
  },
  Glasobject: {
    keywords: ['glasobject', 'glazen', 'glas kunst', 'kristal'],
    tags: ['glasobject', 'glas', 'kristal'],
    categories: ['glas']
  },
  Cadeau: {
    keywords: ['cadeau', 'geschenk', 'kado', 'gift'],
    tags: ['cadeau', 'geschenk', 'kado'],
    categories: ['cadeau']
  }
};

/**
 * Detect product type from various sources
 * Priority: title > tags > category > description
 */
export function detectProductType(product) {
  const title = (product.title || '').toLowerCase();
  const description = (product.content || '').toLowerCase();
  const tags = (product.tags || []).map(t => t.toLowerCase());
  const categories = (product.categories || []).map(c => c.toLowerCase());
  
  // Check each type
  for (const [type, patterns] of Object.entries(TYPE_PATTERNS)) {
    // Priority 1: Title keywords (most reliable)
    if (patterns.keywords.some(kw => title.includes(kw))) {
      return type;
    }
    
    // Priority 2: Tags (very reliable)
    if (patterns.tags.some(tag => tags.some(t => t.includes(tag)))) {
      return type;
    }
    
    // Priority 3: Categories
    if (patterns.categories.some(cat => categories.some(c => c.includes(cat)))) {
      return type;
    }
    
    // Priority 4: Description (less reliable)
    if (patterns.keywords.some(kw => description.includes(kw))) {
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

