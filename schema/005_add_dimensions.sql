-- Add dimensions field for size information
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions TEXT;

-- Index for dimension searches (if needed in future)
CREATE INDEX IF NOT EXISTS idx_products_dimensions ON products(dimensions) WHERE dimensions IS NOT NULL;

