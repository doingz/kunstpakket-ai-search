/**
 * Vercel Edge Function for AI Search
 * Simpler version without complex imports
 */
import { sql } from '@vercel/postgres';
import OpenAI from 'openai';

// CORS helper
function setCorsHeaders(res: Response) {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return headers;
}

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: setCorsHeaders(new Response())
    });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      {
        status: 405,
        headers: setCorsHeaders(new Response())
      }
    );
  }

  try {
    const body = await req.json();
    const { query, limit = 20, offset = 0 } = body;

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing query parameter' }),
        {
          status: 400,
          headers: setCorsHeaders(new Response())
        }
      );
    }

    // Simple response for now - just echo back
    const response = {
      success: true,
      query: {
        original: query,
        parsed: { test: true },
        confidence: 1.0
      },
      results: {
        total: 0,
        showing: 0,
        items: [],
        advice: 'API is live! Database queries komen zo.'
      },
      meta: {
        took_ms: 0
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal error',
        message: error.message
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

export const config = {
  runtime: 'edge'
};

