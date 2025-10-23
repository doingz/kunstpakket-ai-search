/**
 * SQL query builder for product search
 * Builds broad-matching queries (NOT vector search - returns ALL matches)
 */
import { sql } from './db.js';

/**
 * Build and execute product search query
 * @param {Object} filters - Parsed search filters from AI
 * @param {number} limit - Results per page (default 20)
 * @param {number} offset - Pagination offset (default 0)
 * @returns {Promise<Object>} Search results with count
 */
export async function searchProducts(filters, limit = 20, offset = 0) {
  const startTime = Date.now();

  try {
    // Build tsquery from search_terms (OR combined)
    const tsquery = filters.search_terms && filters.search_terms.length > 0
      ? filters.search_terms.join(' | ')
      : null;

    // Prepare category patterns for ILIKE matching
    const categoryPatterns = filters.categories && filters.categories.length > 0
      ? filters.categories.map(cat => `%${cat}%`)
      : null;

    // Prepare tag patterns for ILIKE matching
    const tagPatterns = filters.tag_terms && filters.tag_terms.length > 0
      ? filters.tag_terms.map(tag => `%${tag}%`)
      : null;

    // Build the WHERE conditions
    const conditions = ['p.is_visible = true'];
    const params = [];
    let paramIndex = 1;

    // Base match: search_terms OR categories
    const baseConditions = [];
    
    if (tsquery) {
      baseConditions.push(`p.search_vector @@ to_tsquery('dutch', $${paramIndex})`);
      params.push(tsquery);
      paramIndex++;
    }

    if (categoryPatterns) {
      baseConditions.push(`EXISTS (
        SELECT 1 FROM product_categories pc
        JOIN categories c ON pc.category_id = c.id
        WHERE pc.product_id = p.id
        AND c.title ILIKE ANY($${paramIndex}::text[])
      )`);
      params.push(categoryPatterns);
      paramIndex++;
    }

    if (baseConditions.length > 0) {
      conditions.push(`(${baseConditions.join(' OR ')})`);
    }

    // Price filters
    if (filters.price_min !== null && filters.price_min !== undefined) {
      conditions.push(`p.price >= $${paramIndex}`);
      params.push(filters.price_min);
      paramIndex++;
    }

    if (filters.price_max !== null && filters.price_max !== undefined) {
      conditions.push(`p.price <= $${paramIndex}`);
      params.push(filters.price_max);
      paramIndex++;
    }

    // Tag filter (optional refinement)
    if (tagPatterns && tagPatterns.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM product_tags pt
        JOIN tags t ON pt.tag_id = t.id
        WHERE pt.product_id = p.id
        AND t.title ILIKE ANY($${paramIndex}::text[])
      )`);
      params.push(tagPatterns);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Query for results with ranking
    const resultsQuery = `
      SELECT 
        p.id,
        p.title,
        p.full_title,
        p.content,
        p.brand,
        p.price,
        p.image,
        p.url,
        ${tsquery ? `ts_rank(p.search_vector, to_tsquery('dutch', $1))` : '0'} as relevance
      FROM products p
      WHERE ${whereClause}
      ORDER BY 
        relevance DESC,
        p.price ASC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    // Count query (same conditions, no LIMIT/OFFSET)
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      WHERE ${whereClause}
    `;

    const countParams = params.slice(0, -2); // Remove limit and offset

    // Execute both queries
    const [resultsData, countData] = await Promise.all([
      sql.query(resultsQuery, params),
      sql.query(countQuery, countParams)
    ]);

    const results = resultsData.rows;
    const total = parseInt(countData.rows[0].total, 10);
    const elapsedMs = Date.now() - startTime;

    return {
      success: true,
      results,
      total,
      showing: results.length,
      limit,
      offset,
      elapsed_ms: elapsedMs
    };

  } catch (error) {
    console.error('Search query error:', error);
    return {
      success: false,
      error: 'query_error',
      message: error.message,
      elapsed_ms: Date.now() - startTime
    };
  }
}

/**
 * Get count of products per category (for suggestions)
 */
export async function getCategoryCounts() {
  try {
    const result = await sql`
      SELECT c.title, COUNT(DISTINCT pc.product_id) as count
      FROM categories c
      JOIN product_categories pc ON pc.category_id = c.id
      JOIN products p ON p.id = pc.product_id
      WHERE p.is_visible = true
      GROUP BY c.id, c.title
      ORDER BY count DESC
      LIMIT 20
    `;
    return result.rows;
  } catch (error) {
    console.error('Category count error:', error);
    return [];
  }
}

/**
 * Get popular tags (for suggestions)
 */
export async function getPopularTags(limit = 50) {
  try {
    const result = await sql`
      SELECT t.title, COUNT(DISTINCT pt.product_id) as count
      FROM tags t
      JOIN product_tags pt ON pt.tag_id = t.id
      JOIN products p ON p.id = pt.product_id
      WHERE p.is_visible = true
      GROUP BY t.id, t.title
      ORDER BY count DESC
      LIMIT ${limit}
    `;
    return result.rows;
  } catch (error) {
    console.error('Popular tags error:', error);
    return [];
  }
}

