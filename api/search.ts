/**
 * AI-powered semantic search with Vercel AI SDK + pgvector
 * Node.js Serverless runtime
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { embed, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { sql } from '@vercel/postgres';
import { z } from 'zod';
// Category map for ID->name lookup (hardcoded for performance - update when categories change)
const categoryMap = new Map([
  [8159306, "Liefde & Huwelijk"],
  [8159309, "Relatiegeschenken & Eindejaarsgeschenken"],
  [8159312, "Zakelijke Geschenken"],
  [8159321, "Moderne Kunstcadeaus"],
  [8159330, "Bedankbeelden"],
  [10284228, "Sportbeelden"],
  [10870334, "Jubileum & Afscheid"],
  [11492653, "Geslaagd & Examen"],
  [12363590, "Alle Bronzen & Moderne Beelden"],
  [12702320, "Schalen & Vazen"],
  [29063882, "Keramiek & Beelden"],
  [29063885, "Schilderijen"],
  [29063888, "Zorg & Verpleging"],
  [29063891, "Gezinsbeelden"],
  [29063909, "Wandborden"],
  [29063912, "Museum Kunstcadeaus"],
  [29063915, "Exclusief Brons"],
  [29064002, "Samenwerking & Teambuilding"],
  [29064053, "Frontpagina producten"],
  [29386437, "Nieuw"]
]);

// Explicit Node.js runtime
export const config = {
  runtime: 'nodejs',
  maxDuration: 30 // text-embedding-3-small (1536 dims)
};

// Generate friendly advice for search results
async function generateAdviceMessage(query: string, total: number, filters: any): Promise<string> {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        advice: z.string().describe('Friendly, enthusiastic advice message in Dutch about the search results')
      }),
      prompt: `Create a warm, personal message about these search results:
Query: "${query}"
Results found: ${total}
Filters: ${JSON.stringify(filters)}

Our product catalog:
- Types: Beeld, Schilderij, Vaas, Mok, Schaal, Wandbord, Onderzetters, Theelichthouder
- Popular themes: Sport, Liefde, Dieren (katten, honden, vogels, olifanten), Bloemen, Kunst (Van Gogh, Klimt, etc.), Zakelijk, Gezin, Huwelijk, Jubileum, Geslaagd, Bedanken, Zorg

Guidelines:
- Be conversational and enthusiastic (like a helpful shop assistant!)
- Use 2-4 sentences
- Use a relevant emoji (🎨, ✨, 🎁, 💎, 🌟, 💫)
- Mention what makes these products special
- For 1 result: "perfect match!"
- For 2-10: emphasize quality selection
- For 11-30: mention variety
- For 31+: encourage browsing to find favorite

Examples:
- "✨ Wat fijn dat je zoekt naar een kat beeld! Ik heb 8 prachtige beelden voor je gevonden. Van speels tot elegant, er zit vast iets bij dat perfect past bij jouw smaak!"
- "🎨 Super! Er zijn 23 sportbeelden die aan je wensen voldoen. Van dynamische atleten tot klassieke sporters - neem rustig de tijd om je favoriet uit te kiezen!"
- "💎 Wow, 1 perfect beeld met een voetballer gevonden! Dit is echt een prachtig sportbeeld dat precies past bij wat je zoekt."

Now create an advice message for this search.`,
    });
    
    return object.advice;
  } catch (error: any) {
    console.error('generateAdviceMessage error:', error);
    // Fallback to simple message
    if (total === 1) {
      return '✨ Er is 1 perfect product voor je gevonden!';
    } else if (total <= 10) {
      return `🎨 Ik heb ${total} mooie producten voor je gevonden!`;
    } else {
      return `✨ Ik heb ${total} producten gevonden! Bekijk ze allemaal en vind jouw favoriet.`;
    }
  }
}

// Generate friendly message for vague/empty queries
async function generateEmptyStateMessage(query: string): Promise<string> {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        advice: z.string().describe('Friendly, helpful message in Dutch to guide the user to search better')
      }),
      prompt: `The user searched for: "${query}"
This query is too vague to find good products (no specific type, theme, or price).

Our product catalog:
- Types: Beeld (733), Schilderij (25), Vaas (39), Mok (25), Schaal (15), Wandbord (31), Onderzetters (15), Theelichthouder (13)
- Popular themes: Sport, Liefde & Romantiek, Dieren (katten, honden, vogels, olifanten), Bloemen, Beroemde Kunstenaars (Van Gogh, Klimt, Monet, Escher), Zakelijk, Gezin, Huwelijk, Jubileum, Geslaagd, Bedanken, Zorg
- Price range: €20 - €500

Create a warm, enthusiastic, positive message that:
- Starts with a cheerful emoji (✨, 🎨, 💫, 🎁, 🌟)
- Be VERY positive and encouraging (no negative words!)
- Briefly acknowledge what they're looking for
- Ask 1-2 clarifying questions about type, theme, or budget
- Give 2-3 concrete search examples using REAL types and themes from our catalog
- Keep it upbeat and helpful (3-4 sentences max)
- End on an encouraging note!

CRITICAL for search examples:
- Use natural Dutch: "kat beeld onder 50 euro" (NOT "kat onderwerp beeld")
- Always include budget in euros: "onder X euro", "max X euro"
- Use simple combinations: [dier/thema] + [type] + [budget]
- GOOD: "bloemen vaas max 80 euro", "sportbeeld onder 150 euro", "Van Gogh mok"
- BAD: "liefde onderwerp vaas", "bloemen thema", "abstract ding"

Examples:
"✨ Wat leuk dat je een cadeau zoekt! We hebben zoveel mooie kunstcadeaus! Zoek je een beeld, schilderij, vaas of mok? En welk thema past erbij - dieren, sport, bloemen of een beroemde kunstenaar? Probeer bijvoorbeeld: 'kat beeld onder 50 euro', 'bloemenvaas max 80 euro' of 'Van Gogh mok onder 30 euro'!"

"🎨 Super! We hebben prachtige kunstcadeaus in alle prijsklassen! Vertel me wat meer: zoek je iets voor een speciale gelegenheid zoals een huwelijk, jubileum of geslaagd? Of heb je een bepaald budget? Probeer bijvoorbeeld: 'huwelijksbeeld onder 100 euro', 'sportbeeld max 150 euro' of 'Klimt onderzetters'!"

"🌟 Wat fijn dat je hier bent! Ons assortiment is enorm! Houdt de persoon van dieren, bloemen of sport? En wat voor type cadeau - een mooi beeld, sierlijk schilderij of leuke mok? Probeer bijvoorbeeld: 'hond beeld onder 80 euro', 'bloemen schilderij max 100 euro' of 'sportbeeld onder 150 euro'!"

Now create a message for: "${query}"`,
    });
    
    return object.advice;
  } catch (error: any) {
    console.error('generateEmptyStateMessage error:', error);
    return '✨ Wat leuk dat je hier bent! Laten we samen het perfecte kunstcadeau vinden. Vertel me wat meer: zoek je een beeld, schilderij, vaas of mok? Probeer bijvoorbeeld: "kat beeld onder 50 euro", "sportbeeld max 100 euro", of "bloemen vaas onder 80 euro".';
  }
}

// AI-powered filter extraction using generateObject
async function parseFilters(query: string) {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        priceMin: z.number().optional().nullable(),
        priceMax: z.number().optional().nullable(),
        productType: z.string().optional().nullable().describe('Product type: Schilderij, Beeld, Vaas, Mok, Schaal, Wandbord, Onderzetters, Theelichthouder, Keramiek'),
        keywords: z.array(z.string()).default([]).describe('Specific search terms (animals, artists, objects). Empty array if none.'),
        requiresExactMatch: z.boolean().default(false).describe('True if searching for specific things that MUST be in title/description')
      }),
      prompt: `Analyze this Dutch product search query and extract filters: "${query}"

Extract:
1. priceMin/priceMax: Concrete numbers ONLY. For "niet te duur", "goedkoop", "luxe" → return null (not enough info)
2. productType: ONLY if explicitly mentioned: Schilderij, Beeld, Vaas, Mok, Schaal, Wandbord, Onderzetters, Theelichthouder
   IMPORTANT: "Keramiek" should map to "Beeld" (ceramic items are sculptures/beelden)
3. keywords: ONLY specific, searchable subjects (animals, artists, colors, themes, objects)
   DO NOT extract generic words like: cadeau, geschenk, present, gift, iets, mooi, leuk, origineel, bijzonder, speciaal, voor, mijn, vader, moeder, zus, broer, vriend, vriendin, oma, opa, etc.
   ONLY extract: specific animals, artists, colors, materials, themes, occasions (huwelijk, jubileum, etc.)
4. requiresExactMatch: true if keywords MUST appear in title/description

CRITICAL RULES:
- Extract productType if user mentions: schilderij, beeld/beeldje/sculptuur/keramiek, vaas, mok, schaal, wandbord, onderzetters, theelicht
- IMPORTANT: "keramiek", "keramieken beeld", "ballonhond" → productType: "Beeld" (ceramics are sculptures)
- DO NOT add product types as keywords
- For artist/designer names: extract artist name as keyword (see list below). Add both full name AND variants (e.g. "Van Gogh" → ["van gogh", "gogh", "vincent van gogh"])
- For animals: add common synonyms AND English translations (e.g. "kat" → ["kat", "poes", "cat"], "hond" → ["hond", "honden", "dog"], "paard" → ["paard", "paarden", "horse"])
- For occasions: use broader terms (e.g. "huwelijkscadeau" → ["huwelijk", "trouwen"], "bedankje" → ["bedanken", "dank"])
- IMPORTANT ARTISTS IN CATALOG (recognize these names):
  Famous Artists: Van Gogh, Klimt, Monet, Dali, Vermeer, Rembrandt, Mondriaan, Rodin, Modigliani, Magritte, Escher, Michelangelo, Da Vinci, Egon Schiele, Camille Claudel, Botticelli, Paul Gauguin, Jeroen Bosch, Kandinsky
  Contemporary Artists: Jeff Koons, Herman Brood, Banksy
  Dutch Artists: Corry Ammerlaan, Ger van Tankeren, Peter Donkersloot, Klaas Gubbels, Jacky Zegers, Jack Liemburg, Harrie Gerritz, Tos Kostermans, Bram Reijnders, Jeroen Krabb, Mark Jurriens
  Designers/Brands: Kokeshi (Lucie Kaas designer dolls), Forchino/Guillermo Forchino, Selwyn Senatori, Richard Orlinski, Guido Deleu, Elephant Parade, Becky Kemp
  * When user searches "kokeshi" → add "kokeshi" as keyword AND recognize it's a designer brand
- For categories (important!): extract relevant keywords based on these popular categories:
  * Sport/Fitness → ["sport", "fitness", "atleet", "voetbal", "golf"]
  * Zorg/Verpleging → ["zorg", "verpleging", "care", "dokter", "nurse"]
  * Gezin/Familie → ["gezin", "familie", "kinderen", "vader", "moeder", "baby"]
  * Zakelijk → ["zakelijk", "business", "corporate", "samenwerking", "team"]
  * Liefde/Huwelijk → ["liefde", "huwelijk", "love", "trouwen", "kus"]
  * Jubileum/Afscheid → ["jubileum", "afscheid", "pensioen", "vertrek"]
  * Geslaagd/Examen → ["geslaagd", "examen", "studie", "diploma", "afstuderen"]
  * Bedanken → ["bedanken", "dank", "thanks", "waardering"]
  * Modern → ["modern", "eigentijds", "contemporary"]
  * Exclusief → ["exclusief", "luxe", "premium", "brons"]
- For vague price terms ("niet te duur", "goedkoop", "luxe") → return null for price (semantic search will handle it)
- Use requiresExactMatch=false for category/occasion searches (broader matching)

Examples:
"cadeau voor mijn zus" → {"keywords": []} (too vague - no specific subject!)
"iets moois" → {"keywords": []} (too vague!)
"geschenk voor mijn vader" → {"keywords": []} (too vague!)
"onder 100 euro" → {"priceMax": 100}
"sportbeeld" → {"productType": "Beeld", "keywords": ["sport", "fitness", "atleet"], "requiresExactMatch": false}
"mok" → {"productType": "Mok"}
"hond" → {"keywords": ["hond", "honden", "dog"]}
"dog" → {"keywords": ["hond", "honden", "dog"]}
"sport" → {"keywords": ["sport", "fitness", "atleet"], "requiresExactMatch": false}
"kat" → {"keywords": ["kat", "poes", "cat"], "requiresExactMatch": false}
"poes" → {"keywords": ["kat", "poes", "cat"], "requiresExactMatch": false}
"kokeshi" → {"keywords": ["kokeshi"], "requiresExactMatch": true} (designer brand - MUST be in title!)
"kokeshi beeld" → {"productType": "Beeld", "keywords": ["kokeshi"], "requiresExactMatch": true}
"Beeld max 200 euro" → {"productType": "Beeld", "priceMax": 200}
"Van Gogh schilderij" → {"productType": "Schilderij", "keywords": ["van gogh", "gogh"], "requiresExactMatch": true}
"klimt" → {"keywords": ["klimt", "gustav klimt"], "requiresExactMatch": true}
"jeff koons" → {"keywords": ["jeff koons", "koons"], "requiresExactMatch": true}
"een beeldje met een hond, max 80 euro" → {"priceMax": 80, "productType": "Beeld", "keywords": ["hond", "honden", "dog"], "requiresExactMatch": false}
"schilderij max 300 euro" → {"priceMax": 300, "productType": "Schilderij"}
"niet te duur" → {"priceMax": null}
"goedkoop cadeau" → {"priceMax": null}
"huwelijkscadeau" → {"keywords": ["huwelijk", "trouwen", "bruiloft"], "requiresExactMatch": false}
"bedankje" → {"keywords": ["bedanken", "dank", "thanks"], "requiresExactMatch": false}
"klassiek" → {"keywords": ["klassiek", "traditioneel", "vintage"], "requiresExactMatch": false}
"sportbeeld" → {"productType": "Beeld", "keywords": ["sport", "fitness", "atleet"], "requiresExactMatch": false}
"cadeau voor zorgmedewerker" → {"keywords": ["zorg", "verpleging", "care"], "requiresExactMatch": false}
"zakelijk cadeau" → {"keywords": ["zakelijk", "business", "samenwerking", "team"], "requiresExactMatch": false}
"jubileum" → {"keywords": ["jubileum", "afscheid", "pensioen"], "requiresExactMatch": false}
"geslaagd cadeau" → {"keywords": ["geslaagd", "examen", "diploma", "afstuderen"], "requiresExactMatch": false}
"gezinsbeeld" → {"productType": "Beeld", "keywords": ["gezin", "familie", "kinderen"], "requiresExactMatch": false}
"modern beeld" → {"productType": "Beeld", "keywords": ["modern", "eigentijds"], "requiresExactMatch": false}
"exclusief brons" → {"keywords": ["exclusief", "luxe", "premium", "brons"], "requiresExactMatch": false}`,
    });

    return object;
  } catch (error: any) {
    console.error('parseFilters error:', error);
    // Fallback: return empty filters on AI failure
    return {
      priceMin: null,
      priceMax: null,
      productType: null,
      keywords: [],
      requiresExactMatch: false
    };
  }
}

// Format product for response
function formatProduct(row: any) {
  const categoryIds = row.category_ids || [];
  const categories = categoryIds.map((id: number) => ({
    id,
    name: categoryMap.get(id) || `Unknown (${id})`
  }));
  
  return {
    id: row.id,
    title: row.title,
    fullTitle: row.full_title,
    description: row.description,
    url: row.url,
    price: parseFloat(row.price),
    oldPrice: row.old_price ? parseFloat(row.old_price) : null,
    onSale: row.old_price && parseFloat(row.old_price) > parseFloat(row.price),
    discount: row.old_price 
      ? Math.round((1 - parseFloat(row.price) / parseFloat(row.old_price)) * 100) 
      : 0,
    image: row.image,
    type: row.type,
    artist: row.artist || null,
    dimensions: row.dimensions || null,
    categories: categories,  // Now includes {id, name}
    similarity: row.similarity ? parseFloat(row.similarity) : null
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'Query required' 
      });
    }

    const start = Date.now();

    // Parallel: AI filter parsing + embedding generation (fastest!)
    const [filters, { embedding }] = await Promise.all([
      parseFilters(query),
      embed({
        model: openai.embedding('text-embedding-3-small'),
        value: query
      })
    ]);

    // Build WHERE clause with filters
    let whereClause = 'is_visible = true AND embedding IS NOT NULL';
    const params: any[] = [JSON.stringify(embedding)];
    let paramIndex = 2;

    if (filters.productType) {
      params.push(filters.productType);
      whereClause += ` AND type = $${paramIndex++}`;
    }

    if (filters.priceMax) {
      params.push(filters.priceMax);
      whereClause += ` AND price <= $${paramIndex++}`;
    }

    if (filters.priceMin) {
      params.push(filters.priceMin);
      whereClause += ` AND price >= $${paramIndex++}`;
    }

    // Add keyword filtering if keywords are provided
    if (filters.keywords && filters.keywords.length > 0) {
      const keywordConditions = filters.keywords.map(keyword => {
        params.push(`%${keyword}%`);
        return `(title ILIKE $${paramIndex++} OR description ILIKE $${paramIndex - 1})`;
      }).join(' OR ');
      
      whereClause += ` AND (${keywordConditions})`;
    }

    // Build ORDER BY clause - prioritize exact keyword matches
    let orderBy = 'embedding <=> $1::vector';
    
    if (filters.requiresExactMatch && filters.keywords && filters.keywords.length > 0) {
      // Calculate starting index for keyword parameters
      let keywordParamStartIndex = 2;
      if (filters.productType) keywordParamStartIndex++;
      if (filters.priceMax) keywordParamStartIndex++;
      if (filters.priceMin) keywordParamStartIndex++;
      
      // Boost products with keywords in title
      const keywordBoost = filters.keywords.map((_, idx) => 
        `CASE WHEN title ILIKE $${keywordParamStartIndex + idx} THEN 0 ELSE 1 END`
      ).join(' + ');
      
      orderBy = `(${keywordBoost}), ${orderBy}`;
    }
    
    orderBy += ', stock_sold DESC NULLS LAST';

    // Adaptive similarity threshold based on query specificity
    const hasNoFilters = !filters.productType && (!filters.keywords || filters.keywords.length === 0) && !filters.priceMax && !filters.priceMin;
    const similarityThreshold = hasNoFilters 
      ? 0.70  // Very high threshold for vague queries → likely 0 results
      : 0.35; // Normal threshold for specific queries → find semantic matches
    
    const queryText = `
      SELECT 
        p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.artist, p.dimensions,
        1 - (p.embedding <=> $1::vector) as similarity,
        ARRAY_AGG(DISTINCT pc.category_id) FILTER (WHERE pc.category_id IS NOT NULL) as category_ids
      FROM products p
      LEFT JOIN product_categories pc ON p.id = pc.product_id
      WHERE ${whereClause.replace(/\b(id|title|full_title|description|url|price|old_price|image|type|artist|dimensions|embedding|is_visible|stock_sold)\b/g, 'p.$1')}
        AND (1 - (p.embedding <=> $1::vector)) >= ${similarityThreshold}
      GROUP BY p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.artist, p.dimensions, p.embedding, p.stock_sold
      ORDER BY ${orderBy.replace(/\b(title|embedding|stock_sold)\b/g, 'p.$1')}
      LIMIT 50
    `;

    let result = await sql.query(queryText, params);

    // Fallback: if 0 results with keywords, retry without keyword filter (semantic search only)
    if (result.rows.length === 0 && filters.keywords && filters.keywords.length > 0) {
      console.log('Fallback: 0 results with keywords, retrying without keyword filter');
      
      let fallbackWhereClause = 'is_visible = true AND embedding IS NOT NULL';
      const fallbackParams: any[] = [JSON.stringify(embedding)];
      let fallbackParamIndex = 2;
      
      if (filters.productType) {
        fallbackParams.push(filters.productType);
        fallbackWhereClause += ` AND type = $${fallbackParamIndex++}`;
      }
      
      if (filters.priceMax) {
        fallbackParams.push(filters.priceMax);
        fallbackWhereClause += ` AND price <= $${fallbackParamIndex++}`;
      }
      
      if (filters.priceMin) {
        fallbackParams.push(filters.priceMin);
        fallbackWhereClause += ` AND price >= $${fallbackParamIndex++}`;
      }
      
      const fallbackQuery = `
        SELECT 
          p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.artist, p.dimensions,
          1 - (p.embedding <=> $1::vector) as similarity,
          ARRAY_AGG(DISTINCT pc.category_id) FILTER (WHERE pc.category_id IS NOT NULL) as category_ids
        FROM products p
        LEFT JOIN product_categories pc ON p.id = pc.product_id
        WHERE ${fallbackWhereClause.replace(/\b(id|title|full_title|description|url|price|old_price|image|type|artist|dimensions|embedding|is_visible|stock_sold)\b/g, 'p.$1')}
          AND (1 - (p.embedding <=> $1::vector)) >= ${similarityThreshold}
        GROUP BY p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.artist, p.dimensions, p.embedding, p.stock_sold
        ORDER BY p.embedding <=> $1::vector, p.stock_sold DESC NULLS LAST
        LIMIT 50
      `;
      
      result = await sql.query(fallbackQuery, fallbackParams);
    }

    // Generate AI-powered advice messages
    const total = result.rows.length;
    let advice = '';
    
    if (total === 0) {
      // No results - check if query was too vague
      const hasNoFilters = !filters.productType && (!filters.keywords || filters.keywords.length === 0) && !filters.priceMax && !filters.priceMin;
      
      if (hasNoFilters) {
        // Too vague - generate friendly help message
        advice = await generateEmptyStateMessage(query);
      } else {
        // Valid query, just no matches - stay positive!
        advice = '✨ Laten we je zoekopdracht iets aanpassen om betere resultaten te vinden! Probeer het iets breder of verander je filters.';
      }
    } else {
      // Results found - generate enthusiastic message
      advice = await generateAdviceMessage(query, total, filters);
    }

    const response = {
      success: true,
      needsMoreInfo: false,
      query: {
        original: query,
        filters: filters,
        took_ms: Date.now() - start
      },
      results: {
        total: result.rows.length,
        showing: result.rows.length,
        items: result.rows.map(formatProduct),
        advice: advice
      }
    };

    return res.status(200).json(response);

  } catch (error: any) {
    console.error('Search error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      details: error.message
    });
  }
}
