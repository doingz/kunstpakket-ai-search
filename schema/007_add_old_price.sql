-- Add old_price field for sale/discount prices
-- When old_price > price, the product is on sale

ALTER TABLE products ADD COLUMN old_price DECIMAL(10,2);

-- Add index for finding products on sale
CREATE INDEX products_on_sale_idx ON products(old_price) 
  WHERE is_visible = true AND old_price IS NOT NULL AND old_price > price;

-- Add comment
COMMENT ON COLUMN products.old_price IS 'Original price before discount. When old_price > price, product is on sale.';

