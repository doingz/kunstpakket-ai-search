/**
 * Product Type Detector
 * Classifies products into types based on title, description, and categories
 */

const TYPE_RULES = {
  'Schilderij': {
    titleKeywords: ['schilderij', 'canvas', 'painting', 'doek met', 'giclee', 'giclée', 'gicle'],
    descriptionKeywords: ['handgeschilderd', 'geschilderd doek', 'opgespannen op', 'spieraam', 'origineel schilderij', 'giclee', 'giclée'],
    excludeKeywords: ['beeld', 'beeldje', 'sculptuur', 'masker', 'spiegeldoosje', 'vaas', 'mok'],
    priority: 10
  },
  
  'Beeld': {
    titleKeywords: [
      'beeld', 'sculptuur', 'beeldje', 'sculpturen', 
      'verbronsd', 'verzilverd', 'bronzen', 'statue'
    ],
    descriptionKeywords: [
      'beeld', 'sculptuur', 'verbronsd', 'verzilverd',
      'tin gegoten', 'tin legering', 'kunsthars'
    ],
    excludeKeywords: ['wandbord', 'schaal', 'vaas', 'mok'],
    priority: 9
  },
  
  'Wandbord': {
    titleKeywords: ['wandbord', 'wanddecoratie', 'wall plate'],
    descriptionKeywords: ['wandbord', 'ophangen', 'muur', 'wanddecoratie'],
    priority: 10
  },
  
  'Onderzetters': {
    titleKeywords: ['onderzetter', 'coaster'],
    descriptionKeywords: ['onderzetter', 'coasters'],
    priority: 10
  },
  
  'Theelichthouder': {
    titleKeywords: ['theelicht', 'kaarsenhouder', 'candleholder', 'waxinelicht'],
    descriptionKeywords: ['theelicht', 'kaars', 'waxine'],
    priority: 10
  },
  
  'Vaas': {
    titleKeywords: ['vaas', 'vase'],
    descriptionKeywords: ['vaas', 'bloemen', 'porselein vaas'],
    excludeKeywords: ['schaal'],
    priority: 9
  },
  
  'Schaal': {
    titleKeywords: ['schaal', 'bowl'],
    descriptionKeywords: ['schaal', 'glazen schaal', 'diameter'],
    priority: 9
  },
  
  'Mok': {
    titleKeywords: ['mok', 'beker', 'mug', 'cup'],
    descriptionKeywords: ['mok', 'koffie', 'thee', 'blikken'],
    excludeKeywords: ['vaas', 'schaal'],
    priority: 9
  },
  
  'Keramiek': {
    titleKeywords: ['keramiek', 'ceramic', 'porselein'],
    descriptionKeywords: ['keramiek', 'ceramic', 'porselein', 'gebakken'],
    excludeKeywords: ['wandbord', 'vaas', 'schaal', 'mok', 'theelicht'],
    priority: 5 // Lower priority, only if nothing else matches
  }
};

/**
 * Detect product type based on title, description, and category info
 */
export function detectType(product) {
  const title = (product.title || '').toLowerCase();
  const fullTitle = (product.fulltitle || product.full_title || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const content = (product.content || '').toLowerCase();
  
  // Combine all text
  const allText = `${title} ${fullTitle} ${description} ${content}`;
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [typeName, rules] of Object.entries(TYPE_RULES)) {
    let score = 0;
    
    // Check exclude keywords first (immediate disqualification)
    if (rules.excludeKeywords) {
      const hasExclude = rules.excludeKeywords.some(keyword => 
        title.includes(keyword) || fullTitle.includes(keyword)
      );
      if (hasExclude) continue;
    }
    
    // Check title keywords (highest weight)
    if (rules.titleKeywords) {
      const titleMatches = rules.titleKeywords.filter(keyword =>
        title.includes(keyword) || fullTitle.includes(keyword)
      ).length;
      
      if (titleMatches > 0) {
        score += titleMatches * 100; // Title match is very strong
      }
    }
    
    // Check description keywords (lower weight)
    if (rules.descriptionKeywords && score === 0) {
      const descMatches = rules.descriptionKeywords.filter(keyword =>
        description.includes(keyword) || content.includes(keyword)
      ).length;
      
      if (descMatches > 0) {
        score += descMatches * 20;
      }
    }
    
    // Apply priority
    score *= rules.priority;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = typeName;
    }
  }
  
  return bestMatch || 'Overig';
}

/**
 * Get all possible types
 */
export function getAllTypes() {
  return [...Object.keys(TYPE_RULES), 'Overig'];
}

