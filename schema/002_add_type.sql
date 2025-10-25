-- Add type field to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS type TEXT;

-- Create index for type filtering
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type) WHERE type IS NOT NULL;

-- Create composite index for type + price queries
CREATE INDEX IF NOT EXISTS idx_products_type_price ON products(type, price) WHERE type IS NOT NULL;

