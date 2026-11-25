CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE customer_status AS ENUM ('active','suspended','closed');
CREATE TYPE order_status AS ENUM ('pending_payment','confirmed','processing','shipped','delivered','cancelled','partially_refunded','refunded');
CREATE TYPE payment_status AS ENUM ('pending','authorized','paid','failed','partially_refunded','refunded');
CREATE TYPE loyalty_transaction_type AS ENUM ('earn','redeem','expire','adjustment','reversal');
CREATE TYPE loyalty_transaction_status AS ENUM ('pending','available','redeemed','expired','reversed');
CREATE TABLE customers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL,
 email_normalized TEXT GENERATED ALWAYS AS (lower(trim(email))) STORED,
 full_name TEXT NOT NULL, phone TEXT, password_hash TEXT,
 status customer_status NOT NULL DEFAULT 'active', email_verified_at TIMESTAMPTZ,
 account_activated_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(email_normalized)
);
CREATE TABLE customer_addresses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 label TEXT, recipient_name TEXT NOT NULL, phone TEXT, address_line_1 TEXT NOT NULL, address_line_2 TEXT,
 city TEXT NOT NULL, region TEXT, postal_code TEXT, country_code CHAR(2) NOT NULL,
 is_default BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_customer_idx ON customer_addresses(customer_id);
CREATE TABLE email_verifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email_normalized TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('account_activation','login','password_reset')),
 token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
 attempts SMALLINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_verifications_lookup_idx ON email_verifications(email_normalized,purpose,expires_at);
CREATE TABLE orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_number TEXT NOT NULL UNIQUE,
 customer_id UUID REFERENCES customers(id) ON DELETE SET NULL, guest_email TEXT,
 currency CHAR(3) NOT NULL, subtotal_minor BIGINT NOT NULL CHECK(subtotal_minor>=0),
 discount_minor BIGINT NOT NULL DEFAULT 0 CHECK(discount_minor>=0),
 shipping_minor BIGINT NOT NULL DEFAULT 0 CHECK(shipping_minor>=0),
 tax_minor BIGINT NOT NULL DEFAULT 0 CHECK(tax_minor>=0), total_minor BIGINT NOT NULL CHECK(total_minor>=0),
 status order_status NOT NULL DEFAULT 'pending_payment', payment_status payment_status NOT NULL DEFAULT 'pending',
 shipping_address_snapshot JSONB NOT NULL, billing_address_snapshot JSONB,
 placed_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(customer_id IS NOT NULL OR guest_email IS NOT NULL)
);
CREATE INDEX orders_customer_date_idx ON orders(customer_id,placed_at DESC);
CREATE INDEX orders_guest_email_idx ON orders(lower(guest_email));
CREATE TABLE order_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL, product_name_snapshot TEXT NOT NULL, sku_snapshot TEXT, size_snapshot TEXT, color_snapshot TEXT,
 quantity INTEGER NOT NULL CHECK(quantity>0), unit_price_minor BIGINT NOT NULL CHECK(unit_price_minor>=0),
 line_total_minor BIGINT NOT NULL CHECK(line_total_minor>=0)
);
CREATE INDEX order_items_order_idx ON order_items(order_id);
CREATE TABLE payments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 provider TEXT NOT NULL, provider_reference TEXT, amount_minor BIGINT NOT NULL CHECK(amount_minor>=0),
 currency CHAR(3) NOT NULL, status payment_status NOT NULL DEFAULT 'pending',
 idempotency_key TEXT UNIQUE, paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments(order_id);
CREATE TABLE loyalty_accounts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
 points_balance BIGINT NOT NULL DEFAULT 0 CHECK(points_balance>=0),
 lifetime_earned BIGINT NOT NULL DEFAULT 0 CHECK(lifetime_earned>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE loyalty_transactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), loyalty_account_id UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE RESTRICT,
 order_id UUID REFERENCES orders(id) ON DELETE RESTRICT, type loyalty_transaction_type NOT NULL,
 status loyalty_transaction_status NOT NULL, points BIGINT NOT NULL CHECK(points>0),
 points_value_minor BIGINT CHECK(points_value_minor>=0), reason TEXT, expires_at TIMESTAMPTZ,
 created_by_admin_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_ledger_account_date_idx ON loyalty_transactions(loyalty_account_id,created_at DESC);
CREATE INDEX loyalty_ledger_order_idx ON loyalty_transactions(order_id);
CREATE TABLE admin_users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','manager','support','fulfilment')),
 is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE admin_audit_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
 action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id UUID, reason TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_entity_idx ON admin_audit_logs(entity_type,entity_id,created_at DESC);
