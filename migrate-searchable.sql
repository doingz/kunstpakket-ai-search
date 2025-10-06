-- Migration: Add searchable_text column and update FTS index

-- Drop old FTS triggers and table
DROP TRIGGER IF EXISTS products_ai;
DROP TRIGGER IF EXISTS products_ad;
DROP TRIGGER IF EXISTS products_au;
DROP TABLE IF EXISTS products_fts;

-- Add searchable_text column
ALTER TABLE products ADD COLUMN searchable_text TEXT;

-- Create new simplified FTS index
CREATE VIRTUAL TABLE products_fts USING fts5(
  id UNINDEXED,
  searchable_text,
  content='products',
  content_rowid='rowid'
);

-- Create new triggers
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

