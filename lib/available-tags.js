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
export function getTagsPromptSection() {
  return `
Available tags in database (ONLY use these - never invent new tags!):
- Occasions: ${AVAILABLE_TAGS.occasions.join(', ')}
- Emotions/Concepts: ${AVAILABLE_TAGS.emotions.join(', ')}
- Sports: ${AVAILABLE_TAGS.sports.join(', ')}
- Subjects: ${AVAILABLE_TAGS.subjects.join(', ')}
- Artists: ${AVAILABLE_TAGS.artists.slice(0, 15).join(', ')}, ...
- Product types: ${AVAILABLE_TAGS.types.join(', ')}

CRITICAL: If user mentions a tag that's NOT in this list, DO NOT add it! Tags must match EXACTLY what's in database.
`;
}

