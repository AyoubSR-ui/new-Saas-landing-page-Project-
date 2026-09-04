import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Shopify app credentials/config. Required — the app cannot authenticate
  // merchants or verify webhooks without them.
  SHOPIFY_API_KEY: z.string().min(1, "SHOPIFY_API_KEY is required"),
  SHOPIFY_API_SECRET: z.string().min(1, "SHOPIFY_API_SECRET is required"),
  SHOPIFY_APP_URL: z
    .string()
    .url("SHOPIFY_APP_URL must be a valid URL")
    .refine((url) => !url.endsWith("/"), "SHOPIFY_APP_URL must not have a trailing slash"),
  SHOPIFY_API_VERSION: z
    .string()
    .regex(/^\d{4}-(01|04|07|10)$/, "SHOPIFY_API_VERSION must look like YYYY-MM (e.g. 2025-01)"),
  SHOPIFY_SCOPES: z.string().min(1, "SHOPIFY_SCOPES is required"),

  // Symmetric key (32 raw bytes, base64-encoded) used for AES-256-GCM
  // encryption of Shopify offline access tokens at rest. Generate with:
  //   openssl rand -base64 32
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, "TOKEN_ENCRYPTION_KEY is required")
    .refine((value) => {
      try {
        return Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    }, "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (e.g. `openssl rand -base64 32`)"),

  AI_PROVIDER_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const env = loadEnv();
