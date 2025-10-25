-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Products table with embeddings
CREATE TABLE products (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  full_title TEXT,
  description TEXT,
  content TEXT,
  url TEXT,
  brand_id BIGINT,
  price NUMERIC(10,2),
  old_price NUMERIC(10,2),
  is_visible BOOLEAN DEFAULT true,
  image TEXT,
  stock_sold INT DEFAULT 0,
  
  -- Vector embedding (1536 dimensions for text-embedding-3-small)
  embedding vector(1536),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories mapping
CREATE TABLE product_categories (
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  category_id BIGINT,
  PRIMARY KEY (product_id, category_id)
);

-- Fast vector similarity search index (IVFFlat for good balance)
CREATE INDEX idx_products_embedding ON products 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- Regular indexes for filters
CREATE INDEX idx_products_visible ON products(is_visible) WHERE is_visible = true;
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_stock_sold ON products(stock_sold DESC);

-- Composite index for common queries
CREATE INDEX idx_products_visible_price ON products(is_visible, price) WHERE is_visible = true;

