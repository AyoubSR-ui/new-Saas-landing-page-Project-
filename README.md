# E-Commerce Landing Page SaaS

Shopify-embedded SaaS that turns a Shopify product into a professionally designed,
conversion-oriented landing page with minimal manual work.

Shopify-first. Pages are structured, validated data (never raw AI-generated HTML/JS as
the source of truth). Draft and published versions are always separate. Mobile-first.
See `docs/decisions/0001-phase-0-foundations.md` for stack rationale and the full spec
context this repo is built from.

## Status

**Phase 0 — Architecture & Repository Foundation.** Health endpoint, env validation,
logging, error handling, Prisma/Postgres wiring, shared Zod schema infrastructure, and
CI are in place. No Shopify integration, data model, editor, or AI generation yet —
those begin in Phase 1 onward.

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
cp .env.example .env   # then set DATABASE_URL to a real, running Postgres instance
npm install
npm run dev             # starts the API on :3000 (requires Postgres to be reachable)
npm run dev:client      # starts the Vite dev server on :5173
```

`server/prisma/schema.prisma` has no models yet (added starting Phase 1/3), so there is
nothing to migrate yet — `npm run prisma:migrate --workspace=server` becomes relevant
once the first model lands.

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
