-- Migration 010: Add vector embeddings support
-- Enable pgvector extension and add embedding column for semantic search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1536 dimensions for text-embedding-3-small)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add index for fast similarity search using cosine distance
-- ivfflat is approximate but fast for large datasets
CREATE INDEX IF NOT EXISTS products_embedding_idx ON products 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Remove old full-text search column (cleanup)
ALTER TABLE products 
DROP COLUMN IF EXISTS search_vector;

-- Add comment for documentation
COMMENT ON COLUMN products.embedding IS 'Vector embedding for semantic search (text-embedding-3-small, 1536 dimensions)';

