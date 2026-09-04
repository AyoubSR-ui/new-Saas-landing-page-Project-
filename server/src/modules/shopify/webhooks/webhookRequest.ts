import type { Request } from "express";
import { UnauthorizedError, ValidationError } from "../../../utils/errors.js";
import { shopifyConfig } from "../config.js";
import { InvalidShopDomainError, normalizeShopDomain } from "../auth/shopDomain.js";
import { verifyShopifyWebhookHmac } from "./verify.js";

export interface VerifiedWebhook {
  shopDomain: string;
  payload: unknown;
}

/**
 * Shared HMAC verification + shop-domain + payload parsing for any Shopify
 * webhook route, built on the same `verifyShopifyWebhookHmac` Phase 1
 * already uses for app/uninstalled — the signature check itself is never
 * duplicated, only this small amount of per-route glue.
 */
export function parseVerifiedShopifyWebhook(req: Request): VerifiedWebhook {
  const hmacHeader = req.header("x-shopify-hmac-sha256");

  if (!req.rawBody || !verifyShopifyWebhookHmac(req.rawBody, hmacHeader, shopifyConfig.apiSecret)) {
    throw new UnauthorizedError("Invalid webhook signature");
  }

  let shopDomain: string;
  try {
    shopDomain = normalizeShopDomain(req.header("x-shopify-shop-domain"));
  } catch (err) {
    if (err instanceof InvalidShopDomainError) {
      throw new ValidationError("Missing or invalid X-Shopify-Shop-Domain header");
    }
    throw err;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    throw new ValidationError("Malformed webhook payload");
  }

  return { shopDomain, payload };
}
