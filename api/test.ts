/**
 * Test endpoint to diagnose performance
 */
import { embed, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Explicit Node.js runtime for stable imports
export const runtime = 'nodejs';
export const maxDuration = 30;

export default async function handler(req: Request) {
  const start = Date.now();
  const timings: any = {};
  
  try {
    const query = "schilderij onder 50 euro";
    
    // Test filter parsing
    const filterStart = Date.now();
    const { object: filters } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        priceMin: z.number().optional(),
        priceMax: z.number().optional()
      }),
      prompt: `Extract filters from: "${query}"`
    });
    timings.filterParsing = Date.now() - filterStart;
    
    // Test embedding
    const embedStart = Date.now();
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: query
    });
    timings.embedding = Date.now() - embedStart;
    
    timings.total = Date.now() - start;
    
    return new Response(JSON.stringify({
      success: true,
      timings,
      filters,
      embeddingLength: embedding.length
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      error: error.message,
      timings,
      elapsed: Date.now() - start
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

