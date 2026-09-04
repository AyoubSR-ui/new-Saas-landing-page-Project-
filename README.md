# E-Commerce Landing Page SaaS

Shopify-embedded SaaS that turns a Shopify product into a professionally designed,
conversion-oriented landing page with minimal manual work.

Shopify-first. Pages are structured, validated data (never raw AI-generated HTML/JS as
the source of truth). Draft and published versions are always separate. Mobile-first.
See `docs/decisions/0001-phase-0-foundations.md` and
`docs/decisions/0002-phase-1-shopify-foundation.md` for stack rationale and the full
spec context this repo is built from.

## Status

**Phase 1 — Shopify App Foundation.** A merchant can install the app (OAuth,
CSRF-protected), the shop installation is persisted with the offline access token
encrypted at rest (AES-256-GCM), embedded-app requests are authenticated via Shopify
App Bridge session tokens, and the `app/uninstalled` webhook is verified and handled
idempotently. See `server/src/modules/shopify/README.md`. No product ingestion,
landing-page editor, AI generation, templates, analytics, or billing yet — those begin
in Phase 2 onward.

## Structure

```
client/   React + Vite + TypeScript (embedded Shopify admin UI, from Phase 1)
server/   Express + TypeScript API (modules/ holds one folder per domain)
shared/   Zod schemas, types, and constants shared by client and server
tests/    Cross-package integration/e2e suites (package-level tests are colocated)
docs/     Architecture, product, API docs, and ADRs (docs/decisions/)
```

## Getting started

```bash
cp .env.example .env   # then set DATABASE_URL and the Shopify/* values (see below)
npm install
npm run prisma:generate --workspace=server
npm run prisma:migrate --workspace=server   # applies migrations (requires Postgres)
npm run dev             # starts the API on :3000
npm run dev:client      # starts the Vite dev server on :5173
```

Required env vars beyond `DATABASE_URL` (see `.env.example`): `SHOPIFY_API_KEY`,
`SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SHOPIFY_API_VERSION`, `SHOPIFY_SCOPES` (from
your Shopify Partner Dashboard app), `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`),
and `VITE_SHOPIFY_API_KEY` (same value as `SHOPIFY_API_KEY`, exposed to the client
bundle — it's a public client ID, not a secret). The server refuses to start without
these — see `server/src/config/env.ts`.

## Scripts

| Command             | Description                                    |
| -------------------- | ----------------------------------------------- |
| `npm run dev`         | Run the API server in watch mode                |
| `npm run dev:client`  | Run the Vite dev server                          |
| `npm run build`       | Build `shared`, `server`, `client` in order      |
| `npm run typecheck`   | Typecheck all workspaces                         |
| `npm run lint`        | Lint the whole repo                              |
| `npm test`            | Run unit/integration tests in `shared` + `server`|

## Health check

`GET /health` on the API verifies the process is up and the database is reachable
(`SELECT 1` via a raw `pg` pool), returning a Zod-validated JSON payload.
