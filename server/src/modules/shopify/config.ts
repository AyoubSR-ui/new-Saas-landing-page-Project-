import { env } from "../../config/env.js";

export const OAUTH_CALLBACK_PATH = "/api/shopify/auth/callback";

export const shopifyConfig = {
  apiKey: env.SHOPIFY_API_KEY,
  apiSecret: env.SHOPIFY_API_SECRET,
  apiVersion: env.SHOPIFY_API_VERSION,
  appUrl: env.SHOPIFY_APP_URL,
  scopes: env.SHOPIFY_SCOPES,
  get redirectUri(): string {
    return `${env.SHOPIFY_APP_URL}${OAUTH_CALLBACK_PATH}`;
  },
} as const;
