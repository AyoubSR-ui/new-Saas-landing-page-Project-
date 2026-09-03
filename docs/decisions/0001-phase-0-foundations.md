# 0001 — Phase 0 foundational stack

## Status
Accepted

## Context
Phase 0 requires picking a concrete framework/toolchain while preserving the module
boundaries and client/server/shared split mandated by the project spec.

## Decisions
- **Language:** TypeScript everywhere, `strict` mode, project-referenced via a shared
  `tsconfig.base.json`.
- **Monorepo:** npm workspaces (`shared`, `server`, `client`) — no extra build-system
  dependency until one is justified.
- **Backend:** Express 4, run under `tsx` in dev, compiled with `tsc` for production.
- **ORM:** Prisma against PostgreSQL. `prisma generate` refuses to emit a client for a
  schema with zero models, so Phase 0 ships only the `schema.prisma` datasource and the
  `prisma migrate`/`prisma generate` scripts — the first real model (and first
  migration) is added in Phase 1/3. Until then, the `/health` connectivity check uses a
  plain `pg` `Pool` (`server/src/db/pool.ts`) instead of the generated client; domain
  code switches to Prisma once models exist.
- **Validation:** Zod, shared between server and client via the `shared` workspace so
  the "AI → structured JSON → validation → renderer" pipeline (never AI → raw
  HTML/JS → execute) has one schema source of truth from the start.
- **Frontend:** React + Vite, TypeScript. Shopify App Bridge/Polaris are added in
  Phase 1 once the embedded-app shell is being built.
- **Logging:** pino, with `redact` configured for auth headers, cookies, and any field
  named `accessToken` / `apiSecret` / `password` / `token` — access tokens and secrets
  must never reach logs per the security requirements.
- **Errors:** a single `AppError` hierarchy + central Express error-handling middleware;
  operational errors return their real message, unexpected errors return a generic
  message in production.
- **Testing:** Vitest for unit/integration, colocated with source in each workspace
  package; Supertest for HTTP-level integration tests against the Express app with a
  mocked `pg` pool (no live database dependency for Phase 0 CI). Root `tests/`
  is reserved for cross-package integration and e2e suites once later phases add the
  services and UI needed to exercise them.
- **CI:** a single GitHub Actions workflow running lint, typecheck, test, and build on
  push/PR.

## Consequences
- No models exist in `schema.prisma` yet, so `prisma generate`/`prisma migrate dev`
  are not run in CI until Phase 1/3 adds the first model; `/health` only proves raw
  Postgres connectivity via `SELECT 1`, not that any domain table is reachable.
- Module folders under `server/src/modules/*` are intentionally empty (README-only)
  until their owning phase.
