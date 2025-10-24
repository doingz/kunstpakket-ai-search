-- Migration: Use description instead of content in search_vector
-- Reason: content contains long HTML with artist bios causing false positives
--         description is short, clean product summary - much better for search!

-- Drop the old search_vector column
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;

-- Recreate search_vector using description instead of content
ALTER TABLE products ADD COLUMN search_vector tsvector 
  GENERATED ALWAYS AS (
    setweight(to_tsvector('dutch', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('dutch', coalesce(full_title, '')), 'B') ||
    setweight(to_tsvector('dutch', coalesce(description, '')), 'C')
  ) STORED;

-- Recreate the GIN index for fast search
DROP INDEX IF EXISTS products_search_idx;
CREATE INDEX products_search_idx ON products USING GIN(search_vector);

