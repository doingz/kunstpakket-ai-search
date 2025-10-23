-- Categories table (with optional parent for hierarchy)
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id),
  url TEXT
);

-- Product-Category junction table (many-to-many)
CREATE TABLE IF NOT EXISTS product_categories (
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

-- Indexes for fast category lookups
CREATE INDEX IF NOT EXISTS product_categories_product_idx ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS product_categories_category_idx ON product_categories(category_id);
CREATE INDEX IF NOT EXISTS categories_title_idx ON categories(title);
CREATE INDEX IF NOT EXISTS categories_parent_idx ON categories(parent_id) WHERE parent_id IS NOT NULL;

