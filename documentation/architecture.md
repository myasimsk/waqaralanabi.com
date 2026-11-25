# WA Custom Commerce Architecture
## Status
Private development only. The Hostinger domain www.waqaralanabi.com is not connected. No production customer data, payment credentials or production secrets belong here.

## Stack
- Existing custom HTML/CSS/JavaScript storefront.
- Node.js 22+, TypeScript and Fastify API.
- PostgreSQL database using parameterized SQL.
- Managed app runtime and managed PostgreSQL preferred; provider/region not selected.
- Email and payment providers to be selected after launch-market requirements are confirmed.

## Environments
1. Local development: local PostgreSQL and synthetic data.
2. Preview/staging: isolated test database and temporary private deployment if needed.
3. Production: created only after owner approval and launch readiness review.
Never share database credentials between environments. Store secrets in environment secret managers, never Git.

## API foundation
- GET /health: process health.
- GET /ready: PostgreSQL readiness.
Customer, order, payment, loyalty and admin routes will be added only with authentication, authorization, validation, rate limits and tests.

## Data and commerce principles
- Money is stored as integer minor units plus ISO currency code.
- Order items and delivery addresses are snapshots at purchase time.
- Loyalty ledger is authoritative; ledger writes and balance updates are transactional.
- Payment/order operations use idempotency protections.
- Email ownership must be verified before account activation.
- Historical guest orders are linked only after email ownership and order verification. An order number alone is not authentication.
- Points become available only after the configured fulfilment/return eligibility policy.
- Refund/cancellation point reversals are idempotent.
- Admin changes are audited.

## Security baseline
HTTPS for hosted environments; Argon2id password hashing; secure HTTP-only SameSite cookies; CSRF protection; strict per-environment CORS; rate limits on authentication, verification and checkout; parameterized queries; server-side price/discount validation; no card number/CVV storage; backups and tested restore procedure.

## Hosting decision checklist
Compare total monthly cost, compute, database storage, egress, backup retention, point-in-time recovery, restore workflow, region latency, private networking, TLS, secret management and deployment rollback. Keep Docker-compatible configuration and standard PostgreSQL for portability.

## Open decisions
Hosting provider/region; email provider; payment providers for Pakistan/Australia/USA; loyalty earn ratio, point value, redemption cap and expiry; return/chargeback policy; admin role matrix.
