/**
 * AI-powered natural language query parser
 * Uses OpenAI GPT-4o-mini to extract structured filters from user queries
 */
import 'dotenv/config';
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Parse natural language search query into structured filters
 * @param {string} userQuery - Natural language query (e.g., "beeldje met hart max 80 euro")
 * @returns {Promise<Object>} Structured filters
 */
export async function parseQuery(userQuery) {
  const startTime = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Je bent een search query parser voor Kunstpakket.nl, een Nederlandse online kunstwinkel.

Analyseer de natuurlijke taal zoekopdracht en extraheer:
1. search_terms: het hoofdonderwerp + synoniemen (NL + EN). Denk breed: meervoud/enkelvoud, varianten.
2. tag_terms: thema's/eigenschappen + synoniemen (bijv. hart → hartje, love, liefde, heart)
3. price_min/max: prijslimieten in euro. Als "goedkoop" → max 50, "betaalbaar" → max 100.
4. color: kleur indien expliciet genoemd
5. categories: producttype + varianten. Mogelijke types: beelden, schilderijen, servies, vazen, sculpturen, keramiek, etc.

Genereer BREED - inclusief synoniemen, NL/EN vertalingen, meervoud/enkelvoud.

Voorbeelden:
- "beeldje" → search_terms: ["beeldje", "beeldjes", "beeld", "beelden", "sculptuur", "sculpture", "figuur"]
- "hart" → tag_terms: ["hart", "harten", "hartje", "hartjes", "love", "liefde", "heart", "hearts"]
- "cadeau voor moeder" → tag_terms: ["cadeau", "gift", "moeder", "mama", "mother", "moederdag"]

Geef confidence score: 0-1 (1 = zeer zeker, <0.7 = onduidelijk)`
        },
        {
          role: 'user',
          content: userQuery
        }
      ],
      functions: [
        {
          name: 'parse_search_query',
          description: 'Extract structured search filters from natural language query',
          parameters: {
            type: 'object',
            properties: {
              search_terms: {
                type: 'array',
                items: { type: 'string' },
                description: 'Main search terms + synonyms (broad)'
              },
              tag_terms: {
                type: 'array',
                items: { type: 'string' },
                description: 'Theme/property tags + synonyms'
              },
              price_min: {
                type: 'number',
                nullable: true,
                description: 'Minimum price in euros'
              },
              price_max: {
                type: 'number',
                nullable: true,
                description: 'Maximum price in euros'
              },
              color: {
                type: 'string',
                nullable: true,
                description: 'Color if mentioned'
              },
              categories: {
                type: 'array',
                items: { type: 'string' },
                description: 'Product categories (beelden, schilderijen, etc.) + variants'
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Confidence score (0-1)'
              }
            },
            required: ['search_terms', 'confidence']
          }
        }
      ],
      function_call: { name: 'parse_search_query' },
      temperature: 0.3, // Lower temp for more consistent parsing
    });

    const functionCall = completion.choices[0].message.function_call;
    
    if (!functionCall || functionCall.name !== 'parse_search_query') {
      throw new Error('AI did not return expected function call');
    }

    const parsed = JSON.parse(functionCall.arguments);
    const elapsedMs = Date.now() - startTime;

    // Validate confidence
    if (parsed.confidence < 0.7) {
      return {
        success: false,
        error: 'unclear_query',
        suggestion: 'Kun je specifieker zijn? Bijvoorbeeld: "beeldje met hart onder 80 euro" of "schilderij abstract blauw"',
        confidence: parsed.confidence,
        elapsed_ms: elapsedMs
      };
    }

    return {
      success: true,
      filters: {
        search_terms: parsed.search_terms || [],
        tag_terms: parsed.tag_terms || [],
        price_min: parsed.price_min || null,
        price_max: parsed.price_max || null,
        color: parsed.color || null,
        categories: parsed.categories || [],
      },
      confidence: parsed.confidence,
      elapsed_ms: elapsedMs
    };

  } catch (error) {
    console.error('Query parsing error:', error);
    return {
      success: false,
      error: 'parse_error',
      message: error.message,
      elapsed_ms: Date.now() - startTime
    };
  }
}

