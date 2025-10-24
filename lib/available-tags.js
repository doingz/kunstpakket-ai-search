/**
 * Available tags in the database
 * Generated from actual product tags - AI should ONLY use these!
 */

export const AVAILABLE_TAGS = {
  // Themes & Occasions
  occasions: ['cadeau', 'geschenk', 'relatiegeschenk', 'jubilaris', 'geslaagd', 'bruiloft', 'opening zaak', 'cadeau nieuw bedrijf'],
  
  // Emotions & Concepts
  emotions: ['liefde', 'samen', 'samenwerken', 'samenwerking', 'team', 'dank', 'geluk', 'succes', 'toekomst', 'prestatie', 'topprestatie'],
  
  // Sports
  sports: ['sport', 'sportprijs', 'sportbeeld', 'voetbal', 'voetballer'],
  
  // Materials
  materials: ['brons', 'bronzen', 'keramiek', 'delftsblauw'],
  
  // Subjects
  subjects: ['dieren', 'dierenbeeld', 'kind', 'vrouw', 'echtpaar', 'muziek', 'hart'],
  
  // Artists (important for search!)
  artists: ['van gogh', 'vincent', 'klimt', 'gustav klimt', 'mondriaan', 'piet mondriaan', 'jeff koons', 'koons', 
            'guido deleu', 'pompon', 'modigliani', 'escher', 'hokusai', 'mucha', 'jacky zegers', 
            'selwyn senatori', 'senatori', 'peter donkersloot', 'klaas gubbels'],
  
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

