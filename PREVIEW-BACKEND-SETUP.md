# Waqar Al Anabi — Preview backend setup

This deployment is a **staging environment only**. It must never be used for real customer data, real fulfilment, or real payments.

## Architecture

- Storefront: Cloudflare Pages preview at https://waqar-al-anabi-preview.pages.dev
- API: Render web service defined in `render.yaml`
- Database: Neon PostgreSQL (create a separate project/database for preview)
- Browser API path: same-origin `/api/*`, forwarded by `functions/api/[[path]].js` to Render
- Real payment processing: disabled. Keep `COMMERCE_LAUNCH_READY=false`.

The same-origin proxy is intentional: customer/admin session cookies remain first-party to the Pages preview domain instead of relying on cross-site cookies.

## 1. Create the Neon preview database

1. Create a Neon account and a new project named `waqar-al-anabi-preview`.
2. Select a nearby region and create a dedicated database for preview only.
3. Copy the pooled or direct PostgreSQL connection string from Neon. Keep it private.
4. Do not use a production database or production credentials.

## 2. Create the Render API

1. Create a Render account and choose **New → Blueprint**.
2. Connect the GitHub repository `myasimsk/waqaralanabi.com`.
3. Select branch `storefront-preview` when configuring the service/blueprint.
4. Render reads `render.yaml` and creates the Node web service.
5. In the Render service environment, set `DATABASE_URL` to the Neon connection string. Keep `DATABASE_SSL=true`, `NODE_ENV=production`, `HOST=0.0.0.0`, and `COMMERCE_LAUNCH_READY=false`.
6. Deploy and confirm the service's `/health` endpoint returns `{"status":"ok","service":"waqar-al-anabi-api"}`.

## 3. Configure Cloudflare Pages preview

1. Open the Cloudflare Pages project for `waqar-al-anabi-preview`.
2. Open **Settings → Variables and Secrets**.
3. Add `API_ORIGIN` as an environment variable for **Preview** (and Production only if separately approved later). Set it to the Render service origin, e.g. `https://waqar-al-anabi-preview-api.onrender.com`, without a trailing slash.
4. Redeploy the preview branch so the Pages Function receives the variable.
5. Open `https://waqar-al-anabi-preview.pages.dev/api/health`. It should return the API health response. If it reports `API_NOT_CONFIGURED`, the Pages variable is missing; if it reports `API_UNAVAILABLE`, check the Render service.

## 4. Database initialization and test data

The backend schema and migrations are currently managed as SQL files under `backend/database`. Apply `schema.sql` first, then every migration in numeric filename order, exactly once, to the **preview Neon database**. Do not run the demo seeder against a production database. The existing seed script intentionally refuses remote/production environments and the demo customer records do not have usable passwords by default.

Before customer/admin/order testing is enabled, the preview-specific seed and test-checkout path must be added and validated. Do not set `COMMERCE_LAUNCH_READY=true` as a shortcut: that flag belongs to real commerce checkout, not test mode.

## 5. Security and cost notes

- Never paste database URLs, passwords, or API secrets into chat or commit them to GitHub.
- Keep all test records synthetic.
- Render's free web service can sleep when idle; the first request may take about a minute to wake.
- Neon free usage has monthly compute/storage/transfer limits. Monitor usage in its dashboard.
- Do not connect the live custom domain or production database to this staging setup.
- Do not merge `storefront-preview` into `main` without explicit approval.

## Current limitation

This setup provides the deployment/proxy foundation. It does **not** by itself migrate the database, create a demo administrator, seed products/variants, or convert the existing browser-local test checkout into database-backed test orders. Those steps must be completed and verified before calling the preview fully end-to-end ready.
