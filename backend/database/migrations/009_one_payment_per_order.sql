-- Each order has exactly one payment record in the current checkout model.
-- Fail safely if historical data contains duplicates; do not discard payment history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM payments
     GROUP BY order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one payment per order: duplicate payment rows exist. Reconcile payment history before applying migration 009.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_order_idx
  ON payments(order_id);
