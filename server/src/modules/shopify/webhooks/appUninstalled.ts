import { Router } from "express";
import { logger } from "../../../utils/logger.js";
import { UnauthorizedError, ValidationError } from "../../../utils/errors.js";
import { shopifyConfig } from "../config.js";
import { InvalidShopDomainError, normalizeShopDomain } from "../auth/shopDomain.js";
import { markShopUninstalled } from "../db/shopRepository.js";
import { verifyShopifyWebhookHmac } from "./verify.js";

export const webhookRouter = Router();

// POST /api/shopify/webhooks/app-uninstalled
webhookRouter.post("/webhooks/app-uninstalled", async (req, res, next) => {
  try {
    const hmacHeader = req.header("x-shopify-hmac-sha256");

    if (!req.rawBody || !verifyShopifyWebhookHmac(req.rawBody, hmacHeader, shopifyConfig.apiSecret)) {
      next(new UnauthorizedError("Invalid webhook signature"));
      return;
    }

    let shopDomain: string;
    try {
      shopDomain = normalizeShopDomain(req.header("x-shopify-shop-domain"));
    } catch (err) {
      if (err instanceof InvalidShopDomainError) {
        next(new ValidationError("Missing or invalid X-Shopify-Shop-Domain header"));
        return;
      }
      throw err;
    }

    const shop = await markShopUninstalled(shopDomain);

    // Never log webhook payload contents — only the identifying/outcome facts.
    logger.info({ shopDomain, hadRecord: shop !== null }, "processed app/uninstalled webhook");

    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});
