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
async function generateVagueAdvice(query: string): Promise<{advice: string, suggestions: Array<{label: string, query: string}>}> {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        advice: z.string().describe('Friendly, conversational advice message in Dutch to help refine the search. Ask clarifying questions about interests, budget, or product type. Keep it natural and helpful, like a salesperson would ask.'),
        suggestions: z.array(z.object({
          label: z.string().describe('Button label with emoji (e.g. "🐱 Kat", "💰 Tot €50")'),
          query: z.string().describe('Search query when button is clicked')
        })).describe('5-8 relevant quick filter suggestions based on query context')
      }),
      prompt: `The user searched for: "${query}"

This is too vague to find good art gift products. Write a friendly, helpful message in Dutch to ask for more details.

Guidelines for advice:
- Be conversational and warm (like talking to a customer in a shop)
- Start with a friendly emoji (💬, 🤔, 💡, 🎨, or ✨)
- Ask clarifying questions based on their query context
- Keep it SHORT (max 2-3 sentences)
- Don't use markdown or special formatting

Guidelines for suggestions (5-8 buttons):
- Make them relevant to the user's query context
- Include product types: Beeld, Schilderij, Vaas, Mok (with emoji)
- Include price ranges if budget seems relevant: "Tot €50", "Tot €100", "Tot €200" (with 💰/💎/✨)
- If they mention a person, suggest themes/interests: sport, liefde, dieren, bloemen
- If generic, suggest popular categories: modern, brons, klassiek
- Use emoji for each button (🐱 🐶 🌸 ⚽ ❤️ 💍 🎨 ✨ etc.)
- Keep labels SHORT (2-3 words max)

Examples:

Query: "cadeau voor mijn zus"
Response: {
  "advice": "💬 Leuk dat je een cadeau voor je zus zoekt! Waar houdt ze van? Bijvoorbeeld: dieren, sport, kunst, of een bepaald thema? En heb je een budget in gedachten?",
  "suggestions": [
    {"label": "🗿 Beeld", "query": "beeld"},
    {"label": "🎨 Schilderij", "query": "schilderij"},
    {"label": "🐱 Kat", "query": "kat"},
    {"label": "❤️ Liefde", "query": "liefde"},
    {"label": "⚽ Sport", "query": "sport"},
    {"label": "💰 Tot €50", "query": "onder 50 euro"},
    {"label": "💎 Tot €100", "query": "onder 100 euro"}
  ]
}

Query: "iets leuks"
Response: {
  "advice": "🤔 Ik help je graag! Vertel me wat meer over wat je zoekt. Bijvoorbeeld: een beeld, schilderij, vaas of mok? Of vertel me over de gelegenheid of het thema waar je aan denkt.",
  "suggestions": [
    {"label": "🗿 Beeld", "query": "beeld"},
    {"label": "🎨 Schilderij", "query": "schilderij"},
    {"label": "🏺 Vaas", "query": "vaas"},
    {"label": "☕ Mok", "query": "mok"},
    {"label": "✨ Modern", "query": "modern"},
    {"label": "🌸 Bloemen", "query": "bloemen"}
  ]
}

Query: "origineel geschenk"
Response: {
  "advice": "✨ Een origineel kunstcadeau is altijd een goed idee! Heb je een voorkeur voor een type product of thema?",
  "suggestions": [
    {"label": "🎨 Modern", "query": "modern beeld"},
    {"label": "✨ Brons", "query": "brons"},
    {"label": "💍 Huwelijk", "query": "huwelijkscadeau"},
    {"label": "⚽ Sport", "query": "sportbeeld"},
    {"label": "❤️ Liefde", "query": "liefde"},
    {"label": "🐶 Dieren", "query": "dieren"}
  ]
}

Now create advice and suggestions for: "${query}"`,
    });

    return object;
  } catch (error: any) {
    console.error('generateVagueAdvice error:', error);
    // Fallback message with default suggestions
    return {
      advice: '💬 Ik heb wat meer details nodig om je te helpen! Kun je me vertellen wat voor soort cadeau je zoekt?',
      suggestions: [
        {label: '🗿 Beeld', query: 'beeld'},
        {label: '🎨 Schilderij', query: 'schilderij'},
        {label: '🏺 Vaas', query: 'vaas'},
        {label: '☕ Mok', query: 'mok'},
        {label: '💰 Tot €50', query: 'onder 50 euro'},
        {label: '💎 Tot €100', query: 'onder 100 euro'}
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
2. productType: ONLY if explicitly mentioned: Schilderij, Beeld, Vaas, Mok, Schaal, Wandbord, Onderzetters, Theelichthouder, Keramiek
3. keywords: Specific subjects (animals, artists, objects). Split artist names (e.g. "van gogh" → ["van gogh", "gogh"])
4. requiresExactMatch: true if keywords MUST appear in title/description
5. isVague: Set to FALSE if ANY of these is present:
   - productType is set (Beeld, Schilderij, etc.)
   - priceMin or priceMax is set
   - keywords array has at least 1 item
   Set to TRUE only if ALL are empty/null (no type, no price, no keywords)

CRITICAL RULES:
- Extract productType if user mentions: schilderij, beeld/beeldje/sculptuur, vaas, mok, schaal, wandbord, onderzetters, theelicht, keramiek
- DO NOT add product types as keywords
- For artist names: extract both full name AND last name (e.g. "Van Gogh" → ["van gogh", "gogh"])
- For animals: add common synonyms (e.g. "kat" → ["kat", "poes"], "hond" → ["hond", "honden"])
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
