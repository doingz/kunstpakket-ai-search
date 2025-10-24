/**
 * Available tags in the database
 * Generated from actual product tags - AI should ONLY use these!
 */

export const AVAILABLE_TAGS = {
  // Themes & Occasions
  occasions: ['cadeau', 'geschenk', 'relatiegeschenk', 'jubilaris', 'geslaagd', 'bruiloft', 'opening zaak', 'cadeau nieuw bedrijf'],
  
  // Emotions & Concepts - extracted keywords
  emotions: ['liefde', 'samen', 'elkaar', 'samenwerken', 'samenwerking', 'team', 'dank', 'geluk', 
             'inspiratie', 'succes', 'toekomst', 'prestatie', 'topprestatie'],
  
  // Sports
  sports: ['sport', 'sportprijs', 'sportbeeld', 'voetbal', 'voetballer'],
  
  // Materials
  materials: ['brons', 'bronzen', 'keramiek', 'delftsblauw'],
  
  // Subjects - extracted from product content
  subjects: ['dieren', 'dierenbeeld', 'hond', 'kat', 'paard', 'olifant', 'olifanten', 'vogel', 
             'kind', 'vrouw', 'echtpaar', 'muziek', 'hart', 'liefde', 'huis', 'visitor', 'geliefde'],
  
  // Artists (important for search!) - extracted from products
  artists: ['gogh', 'vincent', 'van gogh', 'klimt', 'gustav klimt', 'mondriaan', 'piet mondriaan', 
            'koons', 'jeff koons', 'deleu', 'guido deleu', 'pompon', 'escher', 'hokusai', 'modigliani',
            'mucha', 'jacky zegers', 'senatori', 'selwyn senatori', 'peter donkersloot', 'klaas gubbels',
            'corry ammerlaan', 'ammerlaan'],
  
  // Product types (from titles)
  types: ['vaas', 'schaal', 'wandbord', 'mok', 'kandelaar', 'urn', 'sculptuur', 'schilderij'],
  
  // Collections
  collections: ['museumcollectie', 'the visitor', 'elephant parade', 'ballonhond', 'balloondog', 'bosa'],
  
  // Industries
  industries: ['zakelijk', 'zorg', 'ziekenhuis', 'organisatie', 'museum', 'kunst']
};

/**
 * Get all tags as flat array
 */
export function getAllTags() {
  return Object.values(AVAILABLE_TAGS).flat();
}

/**
 * Build AI prompt section with available tags
 */
export async function getTagsPromptSection() {
  // Import real database tags
  const { ALL_DATABASE_TAGS } = await import('./database-tags.js');
  
  // Group tags for better AI understanding
  const tagsByCategory = {
    subjects: ALL_DATABASE_TAGS.filter(t => 
      /hond|kat|paard|vogel|dier|olifant|vis|beer|leeuw|hart/.test(t.toLowerCase())
    ).slice(0, 50),
    artists: ALL_DATABASE_TAGS.filter(t => 
      /gogh|klimt|mondriaan|koons|escher|hokusai|modigliani|picasso|dali/.test(t.toLowerCase())
    ).slice(0, 50),
    sports: ALL_DATABASE_TAGS.filter(t => 
      /voetbal|sport|tennis|golf|marathon|fitness/.test(t.toLowerCase())
    ).slice(0, 30),
    emotions: ALL_DATABASE_TAGS.filter(t => 
      /liefde|geluk|samen|dank|trots|vreugde|inspiratie/.test(t.toLowerCase())
    ).slice(0, 30)
  };
  
  return `
CRITICAL: Available tags in database - AI must ONLY use these exact tags!

Most common tags (use these when user searches for these concepts):
${ALL_DATABASE_TAGS.slice(0, 200).map(t => `"${t}"`).join(', ')}

Subject tags (animals, objects): ${tagsByCategory.subjects.map(t => `"${t}"`).join(', ')}
Artist tags: ${tagsByCategory.artists.map(t => `"${t}"`).join(', ')}
Sport tags: ${tagsByCategory.sports.map(t => `"${t}"`).join(', ')}

RULES:
- If user searches "hond", add tags: ["hond", "beeld hond", "hondje", "ballonhond"] (if they exist above!)
- If user searches "voetbal", add tags: ["voetbal", "voetballer", "voetbalbeeld"] (if they exist above!)
- NEVER invent tags - only use exact matches from the list above!
`;
}

