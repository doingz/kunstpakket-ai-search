/**
 * Analyze product catalog to extract types and themes
 */
import { sql } from '@vercel/postgres';

async function analyzeCatalog() {
  console.log('📊 Analyzing product catalog...\n');
  
  // Get all unique types
  const typesResult = await sql`
    SELECT DISTINCT type, COUNT(*) as count
    FROM products
    WHERE is_visible = true AND type IS NOT NULL
    GROUP BY type
    ORDER BY count DESC
  `;
  
  console.log('=== PRODUCT TYPES ===');
  typesResult.rows.forEach(row => {
    console.log(`${row.type}: ${row.count} products`);
  });
  
  // Analyze themes from titles and descriptions
  const productsResult = await sql`
    SELECT title, description
    FROM products
    WHERE is_visible = true
    LIMIT 1000
  `;
  
  const themes = new Map();
  
  // Theme detection keywords
  const themeKeywords = {
    'Dieren - Katten': ['kat', 'poes', 'kitten', 'chat noir', 'cat'],
    'Dieren - Honden': ['hond', 'dog', 'puppy', 'balloon dog', 'ballonhond'],
    'Dieren - Paarden': ['paard', 'horse'],
    'Dieren - Vogels': ['vogel', 'bird', 'uil', 'owl'],
    'Dieren - Olifanten': ['olifant', 'elephant'],
    'Dieren - Overig': ['dier', 'animal', 'konijn', 'vis', 'fish'],
    'Sport': ['sport', 'voetbal', 'tennis', 'golf', 'atleet', 'fitness', 'voetballer', 'wielrennen'],
    'Liefde & Romantiek': ['liefde', 'love', 'kus', 'hart', 'heart', 'romantisch'],
    'Huwelijk': ['huwelijk', 'trouwen', 'bruiloft', 'wedding'],
    'Bloemen': ['bloem', 'bloemen', 'roos', 'tulp', 'iris', 'flower', 'sunflower'],
    'Muziek': ['muziek', 'music', 'gitaar', 'piano', 'instrument'],
    'Gezin & Familie': ['gezin', 'familie', 'family', 'moeder', 'vader', 'kind', 'baby'],
    'Abstract & Modern': ['abstract', 'modern', 'eigentijds', 'contemporary'],
    'Natuur': ['natuur', 'nature', 'boom', 'tree', 'landschap'],
    'Beroemde Kunstenaars': ['van gogh', 'klimt', 'monet', 'picasso', 'rembrandt', 'vermeer', 'dali', 'escher', 'koons'],
    'Zakelijk': ['zakelijk', 'business', 'corporate', 'team', 'samenwerking', 'leadership'],
    'Geslaagd': ['geslaagd', 'diploma', 'examen', 'afstuderen', 'studie'],
    'Jubileum & Afscheid': ['jubileum', 'afscheid', 'pensioen', 'retirement'],
    'Bedanken': ['bedank', 'dank', 'thanks', 'waardering', 'appreciation'],
    'Zorg': ['zorg', 'verpleging', 'care', 'dokter', 'nurse']
  };
  
  productsResult.rows.forEach(product => {
    const text = ((product.title || '') + ' ' + (product.description || '')).toLowerCase();
    
    Object.entries(themeKeywords).forEach(([theme, keywords]) => {
      if (keywords.some(kw => text.includes(kw))) {
        themes.set(theme, (themes.get(theme) || 0) + 1);
      }
    });
  });
  
  console.log('\n=== THEMES (detected in sample) ===');
  const sortedThemes = Array.from(themes.entries())
    .filter(([_, count]) => count >= 5) // Only themes with 5+ products
    .sort((a, b) => b[1] - a[1]);
  
  sortedThemes.forEach(([theme, count]) => {
    console.log(`${theme}: ${count} products`);
  });
  
  // Generate prompt-ready lists
  console.log('\n=== FOR AI PROMPT ===');
  console.log('\nAvailable types:');
  console.log(typesResult.rows.map(r => r.type).join(', '));
  
  console.log('\nPopular themes:');
  console.log(sortedThemes.map(([theme]) => theme).join(', '));
  
  process.exit(0);
}

analyzeCatalog().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

