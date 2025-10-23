-- Variants table (colors, sizes, stock per product)
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  title TEXT,
  sku TEXT,
  price DECIMAL(10,2),
  stock INTEGER DEFAULT 0
);

-- Indexes for fast variant lookups
CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(product_id);
CREATE INDEX IF NOT EXISTS variants_sku_idx ON variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS variants_stock_idx ON variants(stock) WHERE stock > 0;

