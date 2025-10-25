/**
 * Embedding generation utilities for vector search
 * Uses OpenAI text-embedding-3-small model
 */

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Generate embedding for a single product
 * @param {Object} product - Product with title, full_title, description, type, brand_name, categories
 * @returns {Promise<number[]>} Vector embedding (1536 dimensions)
 */
export async function generateEmbedding(product) {
  // Build semantic text from product data
  const parts = [
    product.title,
    product.full_title,
    product.description,
    product.type,
    product.brand_name
  ];
  
  // Add categories for context (e.g., "Afrikaanse kunst", "Dieren")
  if (product.categories && Array.isArray(product.categories)) {
    parts.push(...product.categories);
  }
  
  const embeddingText = parts.filter(Boolean).join('. ');
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: embeddingText,
    encoding_format: 'float'
  });
  
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple products (batch processing)
 * More efficient for bulk operations
 * @param {Array} products - Array of products
 * @returns {Promise<number[][]>} Array of vector embeddings
 */
export async function generateEmbeddingsBatch(products) {
  const texts = products.map(p => {
    const parts = [
      p.title, 
      p.full_title, 
      p.description, 
      p.type, 
      p.brand_name
    ];
    
    if (p.categories && Array.isArray(p.categories)) {
      parts.push(...p.categories);
    }
    
    return parts.filter(Boolean).join('. ');
  });
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    encoding_format: 'float'
  });
  
  return response.data.map(d => d.embedding);
}

