process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/ecommerce_landing_saas_test";
process.env.LOG_LEVEL ??= "silent";

process.env.SHOPIFY_API_KEY ??= "test-api-key";
process.env.SHOPIFY_API_SECRET ??= "test-api-secret";
process.env.SHOPIFY_APP_URL ??= "https://app.test.example";
process.env.SHOPIFY_API_VERSION ??= "2025-01";
process.env.SHOPIFY_SCOPES ??= "read_products";
// 32 random bytes, base64-encoded — test-only fixture, never used outside vitest.
process.env.TOKEN_ENCRYPTION_KEY ??= "R8acOX5NehwX4gzHvkP8DUoBkPop0qyDCkLrCrbEISI=";
