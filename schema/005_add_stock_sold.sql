-- Add stock_sold column to products table for sorting by popularity
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_sold INTEGER DEFAULT 0;

-- Create index for fast sorting
CREATE INDEX IF NOT EXISTS products_stock_sold_idx ON products(stock_sold DESC) WHERE is_visible = true;

