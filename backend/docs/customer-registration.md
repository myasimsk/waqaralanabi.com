# Customer authentication API

## Registration

- `POST /auth/register/request-code`
- `POST /auth/register/complete`

Registration requires an eligible guest order and verification of the email address used for that order. The six-digit code expires after ten minutes and is limited to five attempts. During local development only, the code is written to the backend log. Production registration remains unavailable until transactional email delivery is configured.

## Login and sessions

- `POST /auth/login` accepts `email` and `password`.
- Successful login creates a random opaque session token. Only its SHA-256 hash is stored in PostgreSQL.
- The token is returned only in an HttpOnly cookie named `wa_customer_session`; it is never returned in JSON or written to logs.
- Cookie settings: HttpOnly, SameSite=Strict, Path=/, 30-day maximum age, Secure in production.
- `GET /auth/me` returns the signed-in customer's basic profile.
- `POST /auth/logout` revokes the current server-side session and clears the cookie.
- Login is rate-limited and returns a generic error for invalid credentials.

## Database migration

Apply `database/migrations/002_customer_sessions.sql` after the initial schema:

```powershell
docker compose exec -T postgres psql -U postgres -d wa_store_dev < database\migrations\002_customer_sessions.sql
```

## Production requirements before launch

- Configure a transactional email provider and verified sender domain.
- Add password-reset flow and customer session-management/revocation controls.
- Add CSRF/origin validation appropriate to the final storefront/API deployment topology.
- Enforce HTTPS and Secure cookies in production.
- Add integration tests for login throttling, session expiry/revocation, invalid credentials, and concurrent requests.
- Review retention and privacy requirements.

## Password recovery

- `POST /auth/password/request-reset-code` accepts an email address and always returns the same generic response for existing and non-existing accounts.
- `POST /auth/password/complete-reset` accepts an email address, six-digit code, and a new password of at least 12 characters.
- Reset codes expire after ten minutes, allow at most five attempts, and are single-use.
- A successful reset invalidates all active customer sessions for that account.
- For local development only, the code is written to the backend log. Production password recovery remains unavailable until transactional email delivery is configured.
