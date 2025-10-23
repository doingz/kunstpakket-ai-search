/**
 * AI-powered result advisor
 * Generates personalized advice based on search results
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
 * Generate personalized advice for search results
 * @param {string} originalQuery - User's original search query
 * @param {number} totalCount - Total number of results
 * @param {Array} topResults - Top 5 results for context
 * @param {Object} filters - Applied filters
 * @returns {Promise<Object>} Advice text and highlighted product indices
 */
export async function adviseResults(originalQuery, totalCount, topResults, filters) {
  const startTime = Date.now();

  try {
    // Prepare top results summary (first 5, truncated descriptions)
    const resultsSummary = topResults.slice(0, 5).map((product, idx) => ({
      index: idx,
      title: product.title,
      price: product.price,
      description: product.content ? product.content.substring(0, 80) + '...' : null
    }));

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Je bent een vriendelijke en behulpzame kunstadviseur bij Kunstpakket.nl.

Geef persoonlijk advies bij zoekresultaten:

REGELS:
- Bij veel resultaten (>50): suggereer verdere filtering op thema's of prijs
- Bij weinig resultaten (≤50): highlight 1-2 specifieke producten met persoonlijke reden waarom ze goed passen
- Max 3 zinnen, warm en persoonlijk maar niet overdreven enthousiast
- Spreek de klant aan met "je"
- Gebruik geen emoji's

VOORBEELDEN:

Bij 400 resultaten:
"Ik vond 400 beeldjes voor je. Wil je specifieker zoeken? Bijvoorbeeld op thema (dieren, abstract, liefde) of prijsklasse?"

Bij 12 resultaten:
"Ik vond 12 beeldjes met hartmotieven onder €80. Het beeldje 'Liefde Eeuwig' (€65) is een topper - prachtige detaillering en handgemaakt. Ook mooi: 'Hart van Brons' (€72) van een lokale kunstenaar."

Bij 0 resultaten:
"Ik kon helaas geen producten vinden die precies aan je zoekopdracht voldoen. Probeer het eens met minder specifieke filters of andere zoektermen."`
        },
        {
          role: 'user',
          content: `Zoekopdracht: "${originalQuery}"
Aantal resultaten: ${totalCount}

Top 5 producten:
${JSON.stringify(resultsSummary, null, 2)}

Filters toegepast:
${JSON.stringify(filters, null, 2)}

Geef kort advies (max 3 zinnen).`
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    const advice = completion.choices[0].message.content.trim();
    const elapsedMs = Date.now() - startTime;

    // Try to detect which products were mentioned (simple heuristic)
    const highlightedIndices = [];
    topResults.forEach((product, idx) => {
      if (advice.includes(product.title)) {
        highlightedIndices.push(idx);
      }
    });

    return {
      success: true,
      advice,
      highlighted_indices: highlightedIndices,
      elapsed_ms: elapsedMs
    };

  } catch (error) {
    console.error('Advice generation error:', error);
    
    // Fallback to simple template-based advice
    let fallbackAdvice = '';
    if (totalCount === 0) {
      fallbackAdvice = 'Ik kon geen producten vinden die aan je zoekopdracht voldoen. Probeer het met andere zoektermen.';
    } else if (totalCount > 100) {
      fallbackAdvice = `Ik vond ${totalCount} producten. Wil je specifieker zoeken met extra filters?`;
    } else if (totalCount > 50) {
      fallbackAdvice = `Ik vond ${totalCount} producten. Bekijk de top resultaten of verfijn je zoekopdracht verder.`;
    } else {
      fallbackAdvice = `Ik vond ${totalCount} producten die passen bij je zoekopdracht. Bekijk de resultaten hieronder.`;
    }

    return {
      success: true,
      advice: fallbackAdvice,
      highlighted_indices: [],
      fallback: true,
      elapsed_ms: Date.now() - startTime
    };
  }
}

