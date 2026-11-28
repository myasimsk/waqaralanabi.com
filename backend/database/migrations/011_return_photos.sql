CREATE TABLE IF NOT EXISTS order_return_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  order_item_id UUID NOT NULL,
  unit INTEGER NOT NULL CHECK (unit > 0),
  side TEXT NOT NULL CHECK (side IN ('front','back')),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  file_bytes BYTEA NOT NULL,
  FOREIGN KEY (request_id, order_item_id) REFERENCES order_return_items(request_id, order_item_id) ON DELETE CASCADE,
  UNIQUE(request_id, order_item_id, unit, side)
);
