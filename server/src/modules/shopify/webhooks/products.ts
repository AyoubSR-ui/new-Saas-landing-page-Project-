import { Router, type NextFunction, type Request, type Response } from "express";
import { logger } from "../../../utils/logger.js";
import { findShopByDomain } from "../db/shopRepository.js";
import { markProductDeletedByShopifyId, upsertProduct } from "../products/productRepository.js";
import { normalizeWebhookProduct, normalizeWebhookProductId, WebhookProductPayloadError } from "../products/webhookProductAdapter.js";
import type { NormalizedProduct } from "../products/types.js";
import { parseVerifiedShopifyWebhook } from "./webhookRequest.js";

export const productWebhookRouter = Router();

// `products/create` and `products/update` both resolve to an upsert — an
// update to an already-synced product and the first sight of a new one are
// handled identically and idempotently, so one handler covers both topics.
async function handleUpsertWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { shopDomain, payload } = parseVerifiedShopifyWebhook(req);
    const shop = await findShopByDomain(shopDomain);

    if (!shop || shop.status !== "INSTALLED") {
      // Unknown or uninstalled shop: acknowledge so Shopify stops retrying,
      // but do nothing — never create data for a shop we don't trust.
      res.status(200).json({ status: "ok" });
      return;
    }

    let normalized: NormalizedProduct;
    try {
      normalized = normalizeWebhookProduct(payload);
    } catch (err) {
      if (err instanceof WebhookProductPayloadError) {
        res.status(200).json({ status: "ignored", reason: "malformed payload" });
        return;
      }
      throw err;
    }

    await upsertProduct(shop.id, normalized);

    logger.info({ shopDomain, shopifyProductId: normalized.shopifyProductId }, "processed product webhook");
    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
}

// POST /api/shopify/webhooks/products-create
productWebhookRouter.post("/webhooks/products-create", handleUpsertWebhook);
// POST /api/shopify/webhooks/products-update
productWebhookRouter.post("/webhooks/products-update", handleUpsertWebhook);

// POST /api/shopify/webhooks/products-delete
productWebhookRouter.post("/webhooks/products-delete", async (req, res, next) => {
  try {
    const { shopDomain, payload } = parseVerifiedShopifyWebhook(req);
    const shop = await findShopByDomain(shopDomain);

    if (!shop || shop.status !== "INSTALLED") {
      res.status(200).json({ status: "ok" });
      return;
    }

    let shopifyProductId: string;
    try {
      shopifyProductId = normalizeWebhookProductId(payload);
    } catch (err) {
      if (err instanceof WebhookProductPayloadError) {
        res.status(200).json({ status: "ignored", reason: "malformed payload" });
        return;
      }
      throw err;
    }

    // Scoped by shop.id, not just shopifyProductId — a colliding id from
    // another shop's catalog (not possible with real Shopify ids, but
    // defense in depth) could never affect this shop's rows or vice versa.
    await markProductDeletedByShopifyId(shop.id, shopifyProductId);

    logger.info({ shopDomain, shopifyProductId }, "processed product delete webhook");
    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});
