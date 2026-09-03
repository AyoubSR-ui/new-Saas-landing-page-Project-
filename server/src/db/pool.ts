import { Pool } from "pg";
import { env } from "../config/env.js";

// Prisma has no models yet (schema.prisma intentionally ships without a domain model
// until Phase 1/3 — `prisma generate` refuses to emit a client for an empty schema).
// This raw pool exists solely to prove PostgreSQL connectivity for /health; once real
// models land, domain queries go through the generated Prisma Client instead.
declare global {
  var __pgPool: Pool | undefined;
}

export const pool = globalThis.__pgPool ?? new Pool({ connectionString: env.DATABASE_URL });

if (env.NODE_ENV !== "production") {
  globalThis.__pgPool = pool;
}
