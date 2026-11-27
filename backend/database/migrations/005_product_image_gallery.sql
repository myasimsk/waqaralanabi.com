ALTER TABLE catalog_products
  ADD COLUMN image_urls TEXT[] NOT NULL DEFAULT '{}';

UPDATE catalog_products
   SET image_urls = ARRAY[image_url]
 WHERE image_url IS NOT NULL AND image_url <> ''
   AND cardinality(image_urls) = 0;
