# WA Backend — Local Development

This is a private development service. It is not connected to the public WA domain and must only use synthetic test data.

## Requirements
- Node.js 22 or newer
- npm
- Docker Desktop (recommended for local PostgreSQL), or a local PostgreSQL 16+ installation

## Setup
1. Open a terminal in the `backend` folder.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env` and keep the local defaults for development.
4. Start local PostgreSQL from the repository root: `docker compose -f backend/docker-compose.yml up -d`.
5. Apply the base schema from the repository root: `psql "postgresql://postgres:postgres@localhost:5432/wa_store_dev" -v ON_ERROR_STOP=1 -f backend/database/schema.sql`.
6. Apply every migration once, in filename order, from the repository root (PowerShell):
   ```powershell
   Get-ChildItem .\\backend\\database\\migrations\\*.sql | Sort-Object Name | ForEach-Object {
     psql "postgresql://postgres:postgres@localhost:5432/wa_store_dev" -v ON_ERROR_STOP=1 -f $_.FullName
     if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($_.Name)" }
   }
   ```
7. Start the API from `backend`: `npm run dev`.
8. Check `http://127.0.0.1:4000/health` and `http://127.0.0.1:4000/ready`.

## Useful commands
- `npm run typecheck`: check TypeScript types.
- `npm run build`: compile the API.
- `npm start`: run the compiled API.

## Safety
- Never commit `.env` or real credentials.
- Never use production customer data in local development.
- `database/schema.sql` is the base schema. Apply every file in `database/migrations/` once, in numeric filename order, before starting the API. There is not yet an automated migration runner.
- Do not expose this API publicly or connect the Hostinger domain at this stage.
- Do not enable real payments until provider integration, webhook verification and end-to-end tests are complete.


## Creating the first administrator (local / preview)

1. Complete the base schema and all migrations in the Setup section first; migration `003_admin_sessions.sql` is included in that sequence.
2. Set bootstrap values in the backend terminal (do not commit them):
   `$env:ADMIN_BOOTSTRAP_EMAIL = "your-admin-email@example.com"`
   `$env:ADMIN_BOOTSTRAP_ROLE = "owner"`
   `$securePassword = Read-Host "Choose a strong admin password" -AsSecureString
   $env:ADMIN_BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password`
3. Run `npm.cmd run admin:create`.
4. Clear the temporary variables:
   `Remove-Item Env:ADMIN_BOOTSTRAP_EMAIL, Env:ADMIN_BOOTSTRAP_ROLE, Env:ADMIN_BOOTSTRAP_PASSWORD`

The script refuses to overwrite an existing admin email. Use a unique password of at least 16 characters. Bootstrap is a local operational task; do not expose it as a public HTTP endpoint.
