CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE INDEX admin_sessions_user_idx ON admin_sessions(admin_user_id);
CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE loyalty_transactions
  ADD CONSTRAINT loyalty_transactions_admin_fk
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL;
