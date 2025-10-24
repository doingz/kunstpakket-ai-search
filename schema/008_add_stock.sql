-- Add stock column to track inventory levels
ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0;

-- Index for filtering out-of-stock products
CREATE INDEX products_stock_idx ON products(stock) WHERE is_visible = true;

