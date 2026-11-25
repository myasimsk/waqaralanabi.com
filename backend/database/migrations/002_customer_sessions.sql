CREATE TABLE IF NOT EXISTS customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS customer_sessions_customer_idx
  ON customer_sessions(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_sessions_expiry_idx
  ON customer_sessions(expires_at)
  WHERE revoked_at IS NULL;
