-- Add product type field for better filtering
-- Types: Beeld, Schilderij, Vaas, Mok, Wandbord, Schaal, Glasobject, Cadeau

ALTER TABLE products ADD COLUMN type TEXT;

-- Create index for fast type filtering
CREATE INDEX products_type_idx ON products(type) WHERE is_visible = true;

-- Add comment
COMMENT ON COLUMN products.type IS 'Product type detected from title, description, tags, and category. One of: Beeld, Schilderij, Vaas, Mok, Wandbord, Schaal, Glasobject, Cadeau';

