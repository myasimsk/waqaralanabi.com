# Customer registration API (development foundation)

These endpoints implement the first-order account activation flow. They are not a complete production authentication system yet.

## Request a verification code

`POST /auth/register/request-code`

JSON body:

```json
{
  "orderNumber": "WA-ORDER-EXAMPLE",
  "email": "customer@example.com"
}
```

The API checks that the order number belongs to an unlinked guest order with the supplied email. Responses deliberately do not disclose whether an order or email exists. The endpoint is rate-limited.

In local development only, the six-digit code is written to the backend development log. The code is stored as a SHA-256 hash, expires after ten minutes, and older activation codes are invalidated when a new one is requested. Production email delivery is intentionally not enabled until an email provider and verified sender domain are configured.

## Complete registration

`POST /auth/register/complete`

JSON body:

```json
{
  "orderNumber": "WA-ORDER-EXAMPLE",
  "email": "customer@example.com",
  "code": "123456",
  "fullName": "Customer Name",
  "password": "a-long-unique-password"
}
```

The endpoint validates the code, rechecks the order inside a database transaction, creates the customer, hashes the password with scrypt, links eligible guest orders for the verified email, creates an empty loyalty account, and consumes the code. Codes have a five-attempt limit.

## Before production

- Integrate a transactional email provider; never expose verification codes in API responses or production logs.
- Add secure login sessions, logout, password reset, session revocation, and CSRF protection before exposing account sign-in.
- Add automated integration tests for rate limits, expired/reused codes, concurrent registration, duplicate emails, and order ownership.
- Review account/order linking and retention policies with the business owner.
- Do not use real customer data in local development.
