-- Kunstpakket Products Database Schema

DROP TABLE IF EXISTS products;

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  fulltitle TEXT,
  description TEXT,
  content TEXT,
  type TEXT,
  price REAL,
  originalPrice REAL,
  hasDiscount INTEGER DEFAULT 0,
  discountPercent INTEGER,
  stock INTEGER DEFAULT 0,
  salesCount INTEGER DEFAULT 0,
  imageUrl TEXT,
  url TEXT,
  tags TEXT,           -- JSON array stored as string
  categories TEXT,     -- JSON array stored as string
  searchable_text TEXT, -- Combined text for FTS: title + fulltitle + description + content + tags + categories
  syncVersion TEXT,
  updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes for fast filtering
CREATE INDEX idx_type ON products(type);
CREATE INDEX idx_price ON products(price);
CREATE INDEX idx_stock ON products(stock);
CREATE INDEX idx_salesCount ON products(salesCount);
CREATE INDEX idx_hasDiscount ON products(hasDiscount);

-- Full-text search index (simplified - single searchable_text column)
CREATE VIRTUAL TABLE products_fts USING fts5(
  id UNINDEXED,
  searchable_text,
  content='products',
  content_rowid='rowid'
);

-- Trigger to keep FTS in sync
CREATE TRIGGER products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, id, searchable_text)
  VALUES (new.rowid, new.id, new.searchable_text);
END;

CREATE TRIGGER products_ad AFTER DELETE ON products BEGIN
  DELETE FROM products_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER products_au AFTER UPDATE ON products BEGIN
  DELETE FROM products_fts WHERE rowid = old.rowid;
  INSERT INTO products_fts(rowid, id, searchable_text)
  VALUES (new.rowid, new.id, new.searchable_text);
END;

