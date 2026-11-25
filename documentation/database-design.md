# WA Database Design — Initial Draft
This is a design draft, not a production migration.

## Relationships
- Customers have multiple addresses and orders.
- Guest orders can exist before account activation.
- Activation verifies email ownership and access to a matching order.
- Each order contains immutable product snapshots.
- Payments are separate from orders to support retries and partial refunds.
- Each customer has one loyalty account and an append-only transaction ledger.
- Admin actions affecting customers, orders or points are audited.

## Guest order linking
Guest orders begin with guest_email and no customer_id. After email verification and an order ownership check, eligible guest orders are linked inside a database transaction. Order numbers are identifiers, not secrets.

## Loyalty ledger
Each earn, redeem, expire, adjustment or reversal is a separate transaction. Balance changes and ledger inserts must be atomic. Redemption locks the loyalty account and rejects insufficient balances. Refund handling must be idempotent.

## Money
Amounts use integer minor units and ISO 4217 currency codes to avoid floating-point errors and support multiple currencies.

## Before production
Decide data retention/deletion; historical order eligibility after refund/chargeback; loyalty earning, expiry, conversion and redemption rules; address/phone validation; admin role permissions; payment webhook signature verification and idempotency.
