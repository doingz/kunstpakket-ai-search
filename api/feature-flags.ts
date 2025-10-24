/**
 * Feature Flags API
 * Check if widget should be enabled globally
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Check environment variable for kill-switch
    const widgetEnabled = process.env.WIDGET_ENABLED !== 'false';
    
    return res.status(200).json({
      success: true,
      flags: {
        widget_enabled: widgetEnabled,
        require_f1: process.env.REQUIRE_F1 === 'true'
      }
    });
  } catch (error) {
    console.error('Feature flags error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal error' 
    });
  }
}

