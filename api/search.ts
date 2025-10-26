/**
 * AI-powered semantic search with Vercel AI SDK + pgvector
 * 
 * Features:
 * - Natural language query parsing with AI
 * - Vector similarity search for semantic matching
 * - Dynamic catalog metadata (brands, types, themes)
 * - AI-generated conversational advice messages
 * - Adaptive similarity thresholds for vague vs specific queries
 * 
 * @see lib/catalog-metadata.ts for dynamic catalog data
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { embed, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { sql } from '@vercel/postgres';
import { z } from 'zod';
import { buildPromptInstructions, getCatalogSummary, getCategoryName } from '../lib/catalog-metadata';

// Vercel serverless config
export const config = {
  runtime: 'nodejs',
  maxDuration: 30
};

// Constants
const SIMILARITY_THRESHOLD_VAGUE = 0.70;      // High threshold for vague queries → 0 results
const SIMILARITY_THRESHOLD_SPECIFIC = 0.25;   // Lower threshold for specific queries → semantic matches
const SIMILARITY_THRESHOLD_TYPE_ONLY = 0.20;  // Even lower for type-only queries (e.g., "mok", "vaas")
const SIMILARITY_THRESHOLD_KEYWORDS = 0.15;   // Lowest for keyword searches (e.g., "dog", "kat")
const POPULAR_SALES_THRESHOLD = 50;           // Products with 50+ sales are popular (top 5%)
const SCARCE_STOCK_THRESHOLD = 5;             // Products with stock <= 5 are scarce
const MAX_RESULTS = 50;

/**
 * Generate AI-powered conversational advice for search results
 * Uses GPT-4o-mini to create warm, enthusiastic messages
 */
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

${getCatalogSummary()}

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

/**
 * Generate AI-powered helpful message for vague/empty queries
 * Guides users to provide more specific search terms
 */
async function generateEmptyStateMessage(query: string): Promise<string> {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        advice: z.string().describe('Friendly, helpful message in Dutch to guide the user to search better')
      }),
      prompt: `The user searched for: "${query}"
This query is too vague to find good products (no specific type, theme, or price).

${getCatalogSummary()}

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

/**
 * Parse natural language query into structured filters using AI
 * Extracts: price range, product type, artist, keywords, match type
 * Uses dynamic catalog metadata for accurate brand/type matching
 */
async function parseFilters(query: string) {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        priceMin: z.number().optional().nullable(),
        priceMax: z.number().optional().nullable(),
        productType: z.string().optional().nullable().describe('Product type: Schilderij, Beeld, Vaas, Mok, Schaal, Wandbord, Onderzetters, Theelichthouder, Keramiek'),
        artist: z.string().optional().nullable().describe('Artist/designer name if explicitly mentioned'),
        sizeCategory: z.enum(['klein', 'middel', 'groot']).optional().nullable().describe('Size category: klein (<20cm), middel (20-40cm), groot (>40cm)'),
        keywords: z.array(z.string()).default([]).describe('Specific search terms (animals, colors, themes, objects). Empty array if none. DO NOT include artist names here.'),
        requiresExactMatch: z.boolean().default(false).describe('True if searching for specific things that MUST be in title/description')
      }),
      prompt: `Analyze this Dutch product search query and extract filters: "${query}"

Extract:
1. priceMin/priceMax: Concrete numbers ONLY. For "niet te duur", "goedkoop", "luxe" → return null (not enough info)
2. productType: ONLY if explicitly mentioned (see valid types below)
   IMPORTANT: "Keramiek" should map to "Beeld" (ceramic items are sculptures/beelden)
3. artist: Extract artist/designer name if mentioned (see exact brand list below). Use most specific form.
   IMPORTANT: Extract to 'artist' field, NOT to 'keywords' field!
4. sizeCategory: Extract size hints
   - "klein", "kleine", "mini", "compact", "bureau" → klein (<20cm)
   - "middel", "gemiddeld", "normaal", "standaard" → middel (20-40cm)
   - "groot", "grote", "fors", "ruim", "statement" → groot (>40cm)
5. keywords: ONLY specific, searchable subjects (animals, colors, themes, objects)
   DO NOT extract generic words like: cadeau, geschenk, present, gift, iets, mooi, leuk, origineel, bijzonder, speciaal, voor, mijn, vader, moeder, zus, broer, vriend, vriendin, oma, opa, etc.
   DO NOT extract artist names - those go in the 'artist' field!
   ONLY extract: specific animals, colors, materials, themes, occasions (huwelijk, jubileum, etc.)
5. requiresExactMatch: true if keywords MUST appear in title/description

${buildPromptInstructions()}

Examples:
"cadeau voor mijn zus" → {"keywords": []} (too vague - no specific subject!)
"iets moois" → {"keywords": []} (too vague!)
"geschenk voor mijn vader" → {"keywords": []} (too vague!)
"onder 100 euro" → {"priceMax": 100}
"sportbeeld" → {"productType": "Beeld", "keywords": ["sport", "fitness", "atleet"], "requiresExactMatch": false}
"mok" → {"productType": "Mok"}
"hond" → {"keywords": ["hond", "honden", "dog"]}
"dog" → {"keywords": ["hond", "honden", "dog"]}
"klein beeld met een kat" → {"sizeCategory": "klein", "productType": "Beeld", "keywords": ["kat", "poes", "cat"]}
"groot bronzen beeld" → {"sizeCategory": "groot", "productType": "Beeld", "keywords": ["bronzen"]}
"compact bureau beeldje" → {"sizeCategory": "klein", "keywords": ["bureau"]}
"sport" → {"keywords": ["sport", "fitness", "atleet"], "requiresExactMatch": false}
"kat" → {"keywords": ["kat", "poes", "cat"], "requiresExactMatch": false}
"poes" → {"keywords": ["kat", "poes", "cat"], "requiresExactMatch": false}
"kokeshi" → {"artist": "Kokeshi dolls"} (artist filter - NOT keywords!)
"kokeshi beeld" → {"productType": "Beeld", "artist": "Kokeshi dolls"}
"een kokeshi beeld" → {"productType": "Beeld", "artist": "Kokeshi dolls"}
"Beeld max 200 euro" → {"productType": "Beeld", "priceMax": 200}
"Van Gogh schilderij" → {"productType": "Schilderij", "artist": "Vincent van Gogh"} (artist filter!)
"klimt" → {"artist": "Gustav Klimt"} (artist filter!)
"jeff koons" → {"artist": "Jeff Koons"} (artist filter!)
"van gogh" → {"artist": "Vincent van Gogh"}
"forchino" → {"artist": "Guillermo Forchino beelden"}
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
      artist: null,
      sizeCategory: null,
      keywords: [],
      requiresExactMatch: false
    };
  }
}

/**
 * Format database row into clean product object for API response
 * Includes categories, popularity, sale status, dimensions, artist
 */
function formatProduct(row: any) {
  const categoryIds = row.category_ids || [];
  const categories = categoryIds.map((id: number) => ({
    id,
    name: getCategoryName(id)
  }));
  
  const stockSold = row.stock_sold ? parseInt(row.stock_sold) : 0;
  const stock = row.stock ? parseInt(row.stock) : null;
  const isPopular = stockSold >= POPULAR_SALES_THRESHOLD;
  const isScarce = stock !== null && stock > 0 && stock <= SCARCE_STOCK_THRESHOLD;
  
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
    stock,
    stockSold,
    isPopular,
    isScarce,
    categories,
    similarity: row.similarity ? parseFloat(row.similarity) : null
  };
}

/**
 * Main search handler
 * POST /api/search with body: { query: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
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

    // Step 1: Parallel AI processing (filter parsing + embedding generation)
    const [filters, { embedding }] = await Promise.all([
      parseFilters(query),
      embed({
        model: openai.embedding('text-embedding-3-small'),
        value: query
      })
    ]);

    // Step 2: Build SQL WHERE clause based on extracted filters
    let whereClause = 'is_visible = true AND embedding IS NOT NULL';
    const params: any[] = [JSON.stringify(embedding)];
    let paramIndex = 2;

    // Product type filter
    if (filters.productType) {
      params.push(filters.productType);
      whereClause += ` AND type = $${paramIndex++}`;
    }
    
    // Artist filter (matches both artist field and title)
    if (filters.artist) {
      params.push(`%${filters.artist}%`);
      whereClause += ` AND (artist ILIKE $${paramIndex++} OR title ILIKE $${paramIndex - 1})`;
    }

    // Price range filters
    if (filters.priceMax) {
      params.push(filters.priceMax);
      whereClause += ` AND price <= $${paramIndex++}`;
    }
    if (filters.priceMin) {
      params.push(filters.priceMin);
      whereClause += ` AND price >= $${paramIndex++}`;
    }
    
    // Size category filter (based on dimensions field)
    if (filters.sizeCategory) {
      if (filters.sizeCategory === 'klein') {
        // Extract any number from dimensions and check if < 20
        whereClause += ` AND dimensions IS NOT NULL AND CAST(REGEXP_REPLACE(dimensions, '[^0-9]', '', 'g') AS INTEGER) < 20`;
      } else if (filters.sizeCategory === 'middel') {
        whereClause += ` AND dimensions IS NOT NULL AND CAST(REGEXP_REPLACE(dimensions, '[^0-9]', '', 'g') AS INTEGER) BETWEEN 20 AND 40`;
      } else if (filters.sizeCategory === 'groot') {
        whereClause += ` AND dimensions IS NOT NULL AND CAST(REGEXP_REPLACE(dimensions, '[^0-9]', '', 'g') AS INTEGER) > 40`;
      }
    }

    // Keyword filters (OR condition across title/description)
    if (filters.keywords && filters.keywords.length > 0) {
      const keywordConditions = filters.keywords.map(keyword => {
        params.push(`%${keyword}%`);
        return `(title ILIKE $${paramIndex++} OR description ILIKE $${paramIndex - 1})`;
      }).join(' OR ');
      
      whereClause += ` AND (${keywordConditions})`;
    }

    // Step 3: Build ORDER BY clause (prioritize exact keyword matches, then similarity, then popularity)
    let orderBy = 'embedding <=> $1::vector';
    
    if (filters.requiresExactMatch && filters.keywords && filters.keywords.length > 0) {
      let keywordParamStartIndex = 2;
      if (filters.productType) keywordParamStartIndex++;
      if (filters.artist) keywordParamStartIndex++;
      if (filters.priceMax) keywordParamStartIndex++;
      if (filters.priceMin) keywordParamStartIndex++;
      
      const keywordBoost = filters.keywords.map((_, idx) => 
        `CASE WHEN title ILIKE $${keywordParamStartIndex + idx} THEN 0 ELSE 1 END`
      ).join(' + ');
      
      orderBy = `(${keywordBoost}), ${orderBy}`;
    }
    orderBy += ', stock_sold DESC NULLS LAST';

    // Step 4: Determine similarity threshold (adaptive based on query specificity)
    const hasNoFilters = !filters.productType && !filters.artist && !filters.sizeCategory && (!filters.keywords || filters.keywords.length === 0) && !filters.priceMax && !filters.priceMin;
    const isTypeOnlyQuery = filters.productType && !filters.artist && !filters.sizeCategory && (!filters.keywords || filters.keywords.length === 0) && !filters.priceMax && !filters.priceMin;
    const isKeywordOnlyQuery = !filters.productType && !filters.artist && !filters.sizeCategory && filters.keywords && filters.keywords.length > 0;
    
    let similarityThreshold;
    if (hasNoFilters) {
      similarityThreshold = SIMILARITY_THRESHOLD_VAGUE;      // Vague query: high threshold → 0 results
    } else if (isTypeOnlyQuery) {
      similarityThreshold = SIMILARITY_THRESHOLD_TYPE_ONLY;  // Type-only: very low threshold (e.g., "mok")
    } else if (isKeywordOnlyQuery) {
      similarityThreshold = SIMILARITY_THRESHOLD_KEYWORDS;   // Keyword-only: lowest threshold (e.g., "dog", "kat")
    } else {
      similarityThreshold = SIMILARITY_THRESHOLD_SPECIFIC;   // Specific query: normal threshold
    }
    
    // Step 5: Execute main vector search query
    const queryText = `
      SELECT 
        p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.artist, p.dimensions, p.stock, p.stock_sold,
        1 - (p.embedding <=> $1::vector) as similarity,
        ARRAY_AGG(DISTINCT pc.category_id) FILTER (WHERE pc.category_id IS NOT NULL) as category_ids
      FROM products p
      LEFT JOIN product_categories pc ON p.id = pc.product_id
      WHERE ${whereClause.replace(/\b(id|title|full_title|description|url|price|old_price|image|type|artist|dimensions|embedding|is_visible|stock|stock_sold)\b/g, 'p.$1')}
        AND (1 - (p.embedding <=> $1::vector)) >= ${similarityThreshold}
      GROUP BY p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.artist, p.dimensions, p.stock, p.embedding, p.stock_sold
      ORDER BY ${orderBy.replace(/\b(title|embedding|stock_sold)\b/g, 'p.$1')}
      LIMIT ${MAX_RESULTS}
    `;

    let result = await sql.query(queryText, params);

    // Step 6: Fallback query (if 0 results with keywords, retry without keyword filter)
    if (result.rows.length === 0 && filters.keywords && filters.keywords.length > 0) {
      console.log('[Fallback] Retrying without keyword filter for broader semantic search');
      
      let fallbackWhereClause = 'is_visible = true AND embedding IS NOT NULL';
      const fallbackParams: any[] = [JSON.stringify(embedding)];
      let fallbackParamIndex = 2;
      
      if (filters.productType) {
        fallbackParams.push(filters.productType);
        fallbackWhereClause += ` AND type = $${fallbackParamIndex++}`;
      }
      
      if (filters.artist) {
        fallbackParams.push(`%${filters.artist}%`);
        fallbackWhereClause += ` AND (artist ILIKE $${fallbackParamIndex++} OR title ILIKE $${fallbackParamIndex - 1})`;
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
          p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.artist, p.dimensions, p.stock, p.stock_sold,
          1 - (p.embedding <=> $1::vector) as similarity,
          ARRAY_AGG(DISTINCT pc.category_id) FILTER (WHERE pc.category_id IS NOT NULL) as category_ids
        FROM products p
        LEFT JOIN product_categories pc ON p.id = pc.product_id
        WHERE ${fallbackWhereClause.replace(/\b(id|title|full_title|description|url|price|old_price|image|type|artist|dimensions|embedding|is_visible|stock|stock_sold)\b/g, 'p.$1')}
          AND (1 - (p.embedding <=> $1::vector)) >= ${similarityThreshold}
        GROUP BY p.id, p.title, p.full_title, p.description, p.url, p.price, p.old_price, p.image, p.type, p.artist, p.dimensions, p.stock, p.embedding, p.stock_sold
        ORDER BY p.embedding <=> $1::vector, p.stock_sold DESC NULLS LAST
        LIMIT ${MAX_RESULTS}
      `;
      
      result = await sql.query(fallbackQuery, fallbackParams);
    }

    // Step 7: Generate AI-powered conversational advice
    const total = result.rows.length;
    let advice = '';
    
    if (total === 0) {
      const hasNoFilters = !filters.productType && (!filters.keywords || filters.keywords.length === 0) && !filters.priceMax && !filters.priceMin;
      
      if (hasNoFilters) {
        // Vague query → guide user to be more specific
        advice = await generateEmptyStateMessage(query);
      } else {
        // Valid query with no matches → encourage to adjust
        advice = '✨ Laten we je zoekopdracht iets aanpassen om betere resultaten te vinden! Probeer het iets breder of verander je filters.';
      }
    } else {
      // Results found → generate enthusiastic message
      advice = await generateAdviceMessage(query, total, filters);
    }

    // Step 8: Check if discount code should be shown (only for budget searches)
    const showDiscountCode = !!(filters.priceMax || filters.priceMin);
    
    // Step 9: Format and return response
    const response = {
      success: true,
      needsMoreInfo: false,
      query: {
        original: query,
        filters,
        took_ms: Date.now() - start
      },
      results: {
        total: result.rows.length,
        showing: result.rows.length,
        items: result.rows.map(formatProduct),
        advice,
        discountCode: showDiscountCode ? { code: '750', amount: '€7,50', description: 'korting op je bestelling' } : null
      }
    };

    return res.status(200).json(response);

  } catch (error: any) {
    console.error('[Search Error]', error);
    
    return res.status(500).json({
      success: false,
      error: 'Search failed',
      details: error.message
    });
  }
}
