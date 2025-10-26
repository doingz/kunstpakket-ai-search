-- Add artist field for better search filtering
ALTER TABLE products ADD COLUMN IF NOT EXISTS artist TEXT;

-- Index for artist searches
CREATE INDEX IF NOT EXISTS idx_products_artist ON products(artist) WHERE artist IS NOT NULL;

