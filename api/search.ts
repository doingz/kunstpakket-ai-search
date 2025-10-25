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

// Generate contextual advice for vague queries
async function generateVagueAdvice(query: string): Promise<{advice: string, examples: string[]}> {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        advice: z.string().describe('Friendly, conversational advice message in Dutch to help refine the search. Ask clarifying questions about interests, budget, or product type. Keep it natural and helpful, like a salesperson would ask.'),
        examples: z.array(z.string()).describe('6 example search queries that combine type + theme + budget. Must use real types: Beeld, Schilderij, Vaas, Mok')
      }),
      prompt: `The user searched for: "${query}"

This is too vague to find good art gift products. Write a friendly, helpful message in Dutch to ask for more details.

Guidelines for advice:
- Be conversational and warm (like talking to a customer in a shop)
- Start with a friendly emoji (💬, 🤔, 💡, 🎨, or ✨)
- Ask clarifying questions based on their query context
- Keep it SHORT (max 2-3 sentences)
- Don't use markdown or special formatting

Guidelines for examples (6 search queries):
- ALWAYS combine: Type + Theme + Budget
- Type MUST be one of: Beeld, Schilderij, Vaas, Mok (exact spelling!)
- Theme: based on query context (kat, sport, bloemen, liefde, modern, etc.)
- Budget: vary between 50, 80, 100, 150, 200 euro
- Use natural Dutch phrasing: "onder X euro", "max X euro", "tot X euro"

CRITICAL: Every example MUST have all 3 elements!

GOOD examples:
✅ "kat beeld onder 50 euro"
✅ "sportbeeld max 100 euro"
✅ "bloemen vaas tot 80 euro"
✅ "modern schilderij onder 150 euro"
✅ "liefde beeld max 50 euro"
✅ "hond beeld onder 100 euro"

BAD examples (missing elements):
❌ "kat beeld" - no budget!
❌ "onder 100 euro" - no type or theme!
❌ "bloemen" - no type or budget!

Examples:

Query: "cadeau voor mijn zus"
Response: {
  "advice": "💬 Leuk dat je een cadeau voor je zus zoekt! Waar houdt ze van? Bijvoorbeeld: dieren, sport, kunst, of een bepaald thema? En heb je een budget in gedachten?",
  "examples": [
    "kat beeld onder 50 euro",
    "bloemen vaas max 80 euro",
    "liefde beeld tot 100 euro",
    "sportbeeld onder 150 euro",
    "modern schilderij max 200 euro",
    "hond beeld onder 50 euro"
  ]
}

Query: "iets leuks"
Response: {
  "advice": "🤔 Ik help je graag! Vertel me wat meer over wat je zoekt. Bijvoorbeeld: een beeld, schilderij, vaas of mok? Of vertel me over de gelegenheid of het thema waar je aan denkt.",
  "examples": [
    "modern beeld onder 100 euro",
    "bloemen vaas max 50 euro",
    "kat beeld tot 80 euro",
    "liefde schilderij onder 150 euro",
    "sportbeeld max 100 euro",
    "hond beeld onder 50 euro"
  ]
}

Query: "origineel geschenk"
Response: {
  "advice": "✨ Een origineel kunstcadeau is altijd een goed idee! Heb je een voorkeur voor een type product of thema?",
  "examples": [
    "modern beeld onder 100 euro",
    "brons beeld max 150 euro",
    "liefde schilderij tot 100 euro",
    "sportbeeld onder 80 euro",
    "bloemen vaas max 50 euro",
    "kat beeld onder 100 euro"
  ]
}

Now create advice and suggestions for: "${query}"`,
    });

    return object;
  } catch (error: any) {
    console.error('generateVagueAdvice error:', error);
    // Fallback message with default examples
    return {
      advice: '🤔 Ik kan je beter helpen als je me iets meer vertelt! Zoek je een beeld, schilderij, vaas of mok? En wat voor thema of budget heb je in gedachten?',
      examples: [
        'kat beeld onder 50 euro',
        'bloemen vaas max 80 euro',
        'sportbeeld tot 100 euro',
        'liefde beeld onder 50 euro',
        'modern schilderij max 150 euro',
        'hond beeld onder 100 euro'
      ]
    };
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
        requiresExactMatch: z.boolean().default(false).describe('True if searching for specific things that MUST be in title/description'),
        isVague: z.boolean().default(false).describe('True if query is too vague to find good results (e.g. "cadeau voor mijn zus", "iets leuks"). Requires at least ONE specific detail: product type, price, theme, color, artist, animal, or occasion.')
      }),
      prompt: `Analyze this Dutch product search query and extract filters: "${query}"

Extract:
1. priceMin/priceMax: Concrete numbers ONLY. For "niet te duur", "goedkoop", "luxe" → return null (not enough info)
2. productType: ONLY if explicitly mentioned: Schilderij, Beeld, Vaas, Mok, Schaal, Wandbord, Onderzetters, Theelichthouder
   IMPORTANT: "Keramiek" should map to "Beeld" (ceramic items are sculptures/beelden)
3. keywords: Specific subjects (animals, artists, objects). Split artist names (e.g. "van gogh" → ["van gogh", "gogh"])
4. requiresExactMatch: true if keywords MUST appear in title/description

5. isVague: CRITICAL - READ CAREFULLY:
   Step 1: Check if you extracted ANY of these: productType, keywords (length > 0), priceMax, or priceMin
   Step 2: If YES to step 1 → isVague = FALSE (we can search!)
   Step 3: If NO to step 1 → isVague = TRUE (too vague)
   
   IMPORTANT: If keywords array has ANY items → isVague MUST be FALSE!
   
   Examples:
   "bloemen" → keywords: ["bloemen"], isVague: FALSE
   "sport" → keywords: ["sport"], isVague: FALSE
   "mok" → productType: "Mok", isVague: FALSE
   "onder 100 euro" → priceMax: 100, isVague: FALSE
   "cadeau" → keywords: [], productType: null, priceMax: null → isVague: TRUE

CRITICAL RULES:
- Extract productType if user mentions: schilderij, beeld/beeldje/sculptuur/keramiek, vaas, mok, schaal, wandbord, onderzetters, theelicht
- IMPORTANT: "keramiek", "keramieken beeld", "ballonhond" → productType: "Beeld" (ceramics are sculptures)
- DO NOT add product types as keywords
- For artist names: extract both full name AND last name (e.g. "Van Gogh" → ["van gogh", "gogh"])
- For animals: add common synonyms AND English translations (e.g. "kat" → ["kat", "poes", "cat"], "hond" → ["hond", "honden", "dog"], "paard" → ["paard", "paarden", "horse"])
- For occasions: use broader terms (e.g. "huwelijkscadeau" → ["huwelijk", "trouwen"], "bedankje" → ["bedanken", "dank"])
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
"cadeau voor mijn zus" → {"isVague": true}
"iets leuks" → {"isVague": true}
"onder 100 euro" → {"priceMax": 100, "isVague": false}
"sportbeeld" → {"productType": "Beeld", "keywords": ["sport", "fitness", "atleet"], "requiresExactMatch": false, "isVague": false}
"mok" → {"productType": "Mok", "isVague": false}
"hond" → {"keywords": ["hond", "honden", "dog"], "isVague": false}
"dog" → {"keywords": ["hond", "honden", "dog"], "isVague": false}
"sport" → {"keywords": ["sport", "fitness", "atleet"], "requiresExactMatch": false, "isVague": false}
"kat" → {"keywords": ["kat", "poes"], "requiresExactMatch": false, "isVague": false}
"poes" → {"keywords": ["kat", "poes"], "requiresExactMatch": false, "isVague": false}
"hond" → {"keywords": ["hond", "honden"], "requiresExactMatch": false, "isVague": false}
"Beeld max 200 euro" → {"productType": "Beeld", "priceMax": 200, "isVague": false}
"Van Gogh schilderij" → {"productType": "Schilderij", "keywords": ["van gogh", "gogh"], "requiresExactMatch": true, "isVague": false}
"een beeldje met een hond, max 80 euro" → {"priceMax": 80, "productType": "Beeld", "keywords": ["hond", "honden"], "requiresExactMatch": false}
"schilderij max 300 euro" → {"priceMax": 300, "productType": "Schilderij"}
"niet te duur" → {"priceMax": null}
"goedkoop cadeau" → {"priceMax": null}
"iets moois" → {}
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
      requiresExactMatch: false,
      isVague: false
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

    // Vector similarity search with SQL filters, keyword boosting, and similarity threshold
    const similarityThreshold = 0.3; // Minimum similarity score to filter out irrelevant results
    
    const queryText = `
      SELECT 
        p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type,
        1 - (p.embedding <=> $1::vector) as similarity,
        ARRAY_AGG(DISTINCT pc.category_id) FILTER (WHERE pc.category_id IS NOT NULL) as category_ids
      FROM products p
      LEFT JOIN product_categories pc ON p.id = pc.product_id
      WHERE ${whereClause.replace(/\b(id|title|full_title|description|url|price|old_price|image|type|embedding|is_visible|stock_sold)\b/g, 'p.$1')}
        AND (1 - (p.embedding <=> $1::vector)) >= ${similarityThreshold}
      GROUP BY p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.embedding, p.stock_sold
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
          p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type,
          1 - (p.embedding <=> $1::vector) as similarity,
          ARRAY_AGG(DISTINCT pc.category_id) FILTER (WHERE pc.category_id IS NOT NULL) as category_ids
        FROM products p
        LEFT JOIN product_categories pc ON p.id = pc.product_id
        WHERE ${fallbackWhereClause.replace(/\b(id|title|full_title|description|url|price|old_price|image|type|embedding|is_visible|stock_sold)\b/g, 'p.$1')}
          AND (1 - (p.embedding <=> $1::vector)) >= ${similarityThreshold}
        GROUP BY p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.embedding, p.stock_sold
        ORDER BY p.embedding <=> $1::vector, p.stock_sold DESC NULLS LAST
        LIMIT 50
      `;
      
      result = await sql.query(fallbackQuery, fallbackParams);
    }

    // Check if query is too vague (AI-determined)
    const total = result.rows.length;
    
    if (filters.isVague) {
      // Generate contextual AI advice for vague queries
      const vagueFeedback = await generateVagueAdvice(query);
      
      // Return helpful message with AI-generated advice and suggestions
      return res.status(200).json({
        success: true,
        needsMoreInfo: true,
        advice: vagueFeedback.advice,
        suggestions: vagueFeedback.suggestions,
        query: {
          original: query,
          filters: filters,
          took_ms: Date.now() - start
        }
      });
    }

    // Generate friendly advice message for valid results
    let advice = '';
    
    if (total === 0) {
      advice = 'Helaas geen producten gevonden. Probeer een andere zoekopdracht of minder specifieke filters.';
    } else {
      // Check if we have low similarity results (no exact match)
      // Calculate avg similarity of top 10 results (not all 50)
      const topResults = result.rows.slice(0, Math.min(10, result.rows.length));
      const avgSimilarity = topResults.reduce((sum, row) => sum + (row.similarity || 0), 0) / topResults.length;
      const hasSpecificKeywords = filters.keywords && filters.keywords.length > 0 && filters.requiresExactMatch === false;
      
      if (avgSimilarity < 0.58 && hasSpecificKeywords && total > 5) {
        // No exact match, but showing related results
        const keywordText = filters.keywords.length === 1 
          ? `"${filters.keywords[0]}"`
          : filters.keywords.map(k => `"${k}"`).join(' of ');
        advice = `💡 Geen exacte match gevonden voor ${keywordText}, maar wel ${total} gerelateerde producten die misschien interessant zijn!`;
      } else if (total === 1) {
        advice = '✨ Er is 1 perfect product voor je gevonden!';
      } else if (total <= 5) {
        advice = `🎨 Ik heb ${total} mooie producten voor je gevonden!`;
      } else if (total <= 20) {
        advice = `✨ Er zijn ${total} prachtige producten die aan je wensen voldoen!`;
      } else {
        const emojis = ['🎨', '✨', '🎁', '💎', '🌟'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        advice = `${emoji} Ik heb ${total} producten gevonden! Bekijk ze allemaal en vind jouw favoriet.`;
      }
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
