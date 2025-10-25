/**
 * Simple ping endpoint
 */
export const runtime = 'edge';

export default async function handler(req: Request) {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Edge Function works!'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

