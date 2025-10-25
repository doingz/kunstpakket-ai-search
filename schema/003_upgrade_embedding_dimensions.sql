-- Upgrade embeddings from text-embedding-3-small (1536) to text-embedding-3-large (3072)

-- Drop existing embedding column
ALTER TABLE products DROP COLUMN IF EXISTS embedding;

-- Re-add with 3072 dimensions
ALTER TABLE products ADD COLUMN embedding vector(3072);

-- Recreate index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_products_embedding ON products USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Note: Run 'npm run import' to regenerate all embeddings with the new model

