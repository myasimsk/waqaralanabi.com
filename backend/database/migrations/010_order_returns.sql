ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
UPDATE orders o SET delivered_at = delivery.delivered_at
FROM (
  SELECT entity_id, min(created_at) AS delivered_at
  FROM admin_audit_logs
  WHERE action='order.status_delivered' AND entity_type='order'
  GROUP BY entity_id
) delivery
WHERE o.id=delivery.entity_id AND o.status='delivered' AND o.delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS order_return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('refund','exchange')),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','declined','received','completed')),
  reason TEXT NOT NULL,
  credit_minor BIGINT NOT NULL CHECK (credit_minor >= 0),
  replacement_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  replacement_order_id UUID UNIQUE REFERENCES orders(id),
  shipping_minor BIGINT CHECK (shipping_minor >= 0),
  refund_minor BIGINT CHECK (refund_minor >= 0),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_return_items (
  request_id UUID NOT NULL REFERENCES order_return_requests(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  credit_minor BIGINT NOT NULL CHECK (credit_minor >= 0),
  PRIMARY KEY (request_id, order_item_id)
);

CREATE INDEX IF NOT EXISTS order_return_requests_customer_idx
  ON order_return_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_return_requests_order_idx
  ON order_return_requests(order_id);
CREATE INDEX IF NOT EXISTS order_return_items_item_idx
  ON order_return_items(order_item_id);
