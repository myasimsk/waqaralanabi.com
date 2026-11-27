ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS checkout_request_hash TEXT;

-- Preserve every uploaded receipt, but leave only the newest receipt awaiting
-- review for each order. Earlier pending receipts remain available for audit.
WITH ranked_pending_proofs AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY order_id
           ORDER BY uploaded_at DESC, id DESC
         ) AS position
    FROM bank_transfer_proofs
   WHERE review_status = 'pending'
)
UPDATE bank_transfer_proofs AS proof
   SET review_status = 'rejected',
       review_reason = 'Superseded by a newer receipt before review.',
       reviewed_at = now()
  FROM ranked_pending_proofs AS ranked
 WHERE proof.id = ranked.id
   AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transfer_proofs_one_pending_per_order_idx
  ON bank_transfer_proofs(order_id)
  WHERE review_status = 'pending';

-- Order history must retain its inventory reference; deleting a variant that
-- appears on an order would otherwise orphan its reservation/stock movement.
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_variant_id_fkey;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
