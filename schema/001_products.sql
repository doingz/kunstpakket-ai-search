-- Products table with full-text search
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  full_title TEXT,
  content TEXT,
  brand TEXT,
  price DECIMAL(10,2),
  image TEXT,
  url TEXT,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  -- Full-text search vector (Dutch stemming)
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('dutch', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('dutch', coalesce(full_title, '')), 'B') ||
    setweight(to_tsvector('dutch', coalesce(content, '')), 'C')
  ) STORED
);

-- Indexes for fast search
CREATE INDEX IF NOT EXISTS products_search_idx ON products USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS products_price_idx ON products(price) WHERE is_visible = true;
CREATE INDEX IF NOT EXISTS products_visible_idx ON products(is_visible) WHERE is_visible = true;

