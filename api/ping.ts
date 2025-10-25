export default async function handler(req: Request) {
  return new Response(JSON.stringify({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Vercel function works!'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

