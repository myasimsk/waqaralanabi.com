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
5. Apply the initial schema to the local database: `psql "postgresql://postgres:postgres@localhost:5432/wa_store_dev" -f backend/database/schema.sql`.
6. Start the API from `backend`: `npm run dev`.
7. Check `http://127.0.0.1:4000/health` and `http://127.0.0.1:4000/ready`.

## Useful commands
- `npm run typecheck`: check TypeScript types.
- `npm run build`: compile the API.
- `npm start`: run the compiled API.

## Safety
- Never commit `.env` or real credentials.
- Never use production customer data in local development.
- The initial SQL schema is a development baseline, not yet a versioned migration system.
- Do not expose this API publicly or connect the Hostinger domain at this stage.
- Do not enable real payments until provider integration, webhook verification and end-to-end tests are complete.
