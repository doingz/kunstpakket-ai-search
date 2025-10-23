/**
 * Main search API endpoint
 * Orchestrates: AI Parser → DB Query → AI Advisor
 */
import 'dotenv/config';
import { parseQuery } from '../lib/parse-query.js';
import { searchProducts } from '../lib/build-search-query.js';
import { adviseResults } from '../lib/advise-results.js';

/**
 * Execute full search pipeline
 * @param {string} query - Natural language search query
 * @param {number} limit - Results per page (default 20)
 * @param {number} offset - Pagination offset (default 0)
 * @returns {Promise<Object>} Complete search response
 */
export async function search(query, limit = 20, offset = 0) {
  const startTime = Date.now();
  const timings = {};

  try {
    // Step 1: Parse query with AI
    console.log(`🔍 Searching: "${query}"`);
    const parseStart = Date.now();
    const parseResult = await parseQuery(query);
    timings.ai_parse_ms = Date.now() - parseStart;

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error,
        suggestion: parseResult.suggestion,
        meta: {
          took_ms: Date.now() - startTime,
          ...timings
        }
      };
    }

    console.log('  ✅ Parsed:', JSON.stringify(parseResult.filters, null, 2));

    // Step 2: Query database
    const queryStart = Date.now();
    const searchResult = await searchProducts(parseResult.filters, limit, offset);
    timings.db_query_ms = Date.now() - queryStart;

    if (!searchResult.success) {
      return {
        success: false,
        error: searchResult.error,
        message: searchResult.message,
        meta: {
          took_ms: Date.now() - startTime,
          ...timings
        }
      };
    }

    console.log(`  ✅ Found ${searchResult.total} products (showing ${searchResult.showing})`);

    // Step 3: Generate AI advice
    const adviceStart = Date.now();
    const adviceResult = await adviseResults(
      query,
      searchResult.total,
      searchResult.results,
      parseResult.filters
    );
    timings.ai_advice_ms = Date.now() - adviceStart;

    console.log(`  ✅ Advice: "${adviceResult.advice}"`);

    // Step 4: Return complete response
    const totalMs = Date.now() - startTime;
    console.log(`  ⏱️  Total: ${totalMs}ms`);

    return {
      success: true,
      query: {
        original: query,
        parsed: parseResult.filters,
        confidence: parseResult.confidence
      },
      results: {
        total: searchResult.total,
        showing: searchResult.showing,
        limit: searchResult.limit,
        offset: searchResult.offset,
        items: searchResult.results,
        advice: adviceResult.advice,
        highlighted: adviceResult.highlighted_indices
      },
      meta: {
        took_ms: totalMs,
        ...timings
      }
    };

  } catch (error) {
    console.error('❌ Search error:', error);
    return {
      success: false,
      error: 'search_error',
      message: error.message,
      meta: {
        took_ms: Date.now() - startTime,
        ...timings
      }
    };
  }
}

/**
 * Simple HTTP server wrapper (for standalone testing)
 */
export async function handleRequest(req) {
  if (req.method !== 'POST') {
    return {
      status: 405,
      body: { error: 'Method not allowed. Use POST.' }
    };
  }

  const body = await req.json();
  const { query, limit = 20, offset = 0 } = body;

  if (!query || typeof query !== 'string') {
    return {
      status: 400,
      body: { error: 'Missing or invalid "query" parameter' }
    };
  }

  const result = await search(query, limit, offset);

  return {
    status: result.success ? 200 : 500,
    body: result
  };
}

