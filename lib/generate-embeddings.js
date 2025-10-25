/**
 * Embedding generation with Vercel AI SDK
 * Much better error handling and performance than raw OpenAI
 */
import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * Generate embedding for a single product
 */
export async function generateEmbedding(product) {
  const parts = [
    product.title,
    product.full_title,
    product.description,
    product.type,
    product.brand_name
  ];
  
  if (product.categories && Array.isArray(product.categories)) {
    parts.push(...product.categories);
  }
  
  const text = parts.filter(Boolean).join('. ');
  
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: text
  });
  
  return embedding;
}

/**
 * Generate embeddings for multiple products (batch)
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
  
  const { embeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: texts
  });
  
  return embeddings;
}

