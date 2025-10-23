/**
 * Vercel Serverless Function for AI Search
 * Endpoint: /api/search
 */
import { search } from '../api/search.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30, // 30 seconds timeout for AI processing
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }
  
  try {
    const { query, limit = 20, offset = 0 } = req.body;
    
    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "query" parameter'
      });
    }
    
    // Validate limit
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid "limit" parameter (must be 1-100)'
      });
    }
    
    // Perform search
    console.log(`[Search API] Query: "${query}" (limit: ${limit}, offset: ${offset})`);
    const result = await search(query, limit, offset);
    
    // Return result
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('[Search API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}

