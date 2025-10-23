/**
 * Database connection helper for Neon Postgres
 */
import 'dotenv/config';
import { sql } from '@vercel/postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

/**
 * Execute a raw SQL query
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export async function query(queryString, params = []) {
  try {
    const result = await sql.query(queryString, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Test database connection
 */
export async function testConnection() {
  try {
    const result = await sql`SELECT current_database(), version()`;
    console.log('✅ Database connected:', result.rows[0].current_database);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

export { sql };

