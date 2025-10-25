export default async function handler(req: Request) {
  try {
    // Test database connection
    const { sql } = await import('@vercel/postgres');
    const result = await sql`SELECT 1 as test`;

    return new Response(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'Vercel function and database work!',
      dbTest: result.rows[0]
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      status: 'error',
      timestamp: new Date().toISOString(),
      message: 'Database connection failed',
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

