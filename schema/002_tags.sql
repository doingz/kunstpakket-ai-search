-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL UNIQUE
);

-- Product-Tag junction table (many-to-many)
CREATE TABLE IF NOT EXISTS product_tags (
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

-- Indexes for fast tag lookups
CREATE INDEX IF NOT EXISTS product_tags_product_idx ON product_tags(product_id);
CREATE INDEX IF NOT EXISTS product_tags_tag_idx ON product_tags(tag_id);
CREATE INDEX IF NOT EXISTS tags_title_idx ON tags(title);

