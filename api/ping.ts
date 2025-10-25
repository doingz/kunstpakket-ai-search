/**
 * Ultra-simple ping - NO IMPORTS
 */
export const config = {
  runtime: 'edge'
};

export default function handler(req: Request) {
  return new Response('OK', {
    headers: { 'Content-Type': 'text/plain' }
  });
}

