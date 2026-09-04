import { Router } from "express";
import { logger } from "../../../utils/logger.js";
import { AppError, ValidationError } from "../../../utils/errors.js";
import { shopifyConfig } from "../config.js";
import { encryptToken } from "../security/tokenCipher.js";
import { upsertInstalledShop } from "../db/shopRepository.js";
import { InvalidShopDomainError, normalizeShopDomain } from "./shopDomain.js";
import { createOAuthState, consumeOAuthState } from "./state.js";
import { verifyOAuthCallbackHmac } from "./oauthHmac.js";
import { exchangeCodeForToken, TokenExchangeError } from "./tokenExchange.js";

export const oauthRouter = Router();

// GET /api/shopify/auth?shop=<shop>.myshopify.com
// Unauthenticated by design — this *is* the entry point that establishes trust.
oauthRouter.get("/auth", async (req, res, next) => {
  try {
    const shopDomain = normalizeShopDomain(req.query.shop);
    const state = await createOAuthState(shopDomain);

    const authorizeUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    authorizeUrl.searchParams.set("client_id", shopifyConfig.apiKey);
    authorizeUrl.searchParams.set("scope", shopifyConfig.scopes);
    authorizeUrl.searchParams.set("redirect_uri", shopifyConfig.redirectUri);
    authorizeUrl.searchParams.set("state", state);

    res.redirect(302, authorizeUrl.toString());
  } catch (err) {
    if (err instanceof InvalidShopDomainError) {
      next(new ValidationError("A valid `shop` query parameter is required"));
      return;
    }
    next(err);
  }
});

// GET /api/shopify/auth/callback
oauthRouter.get("/auth/callback", async (req, res, next) => {
  try {
    const { code, state, host } = req.query;

    if (typeof code !== "string" || code.length === 0) {
      throw new ValidationError("Missing or invalid `code` parameter");
    }
    if (typeof state !== "string" || state.length === 0) {
      throw new ValidationError("Missing or invalid `state` parameter");
    }

    const shopDomain = normalizeShopDomain(req.query.shop);

    if (!verifyOAuthCallbackHmac(req.query as Record<string, unknown>, shopifyConfig.apiSecret)) {
      throw new AppError("Invalid OAuth callback signature", 401, "INVALID_OAUTH_HMAC");
    }

    const stateValid = await consumeOAuthState(state, shopDomain);
    if (!stateValid) {
      throw new AppError("Invalid or expired OAuth state", 403, "INVALID_OAUTH_STATE");
    }

    const { accessToken, scope } = await exchangeCodeForToken(shopDomain, code);
    const accessTokenCiphertext = encryptToken(accessToken);

    await upsertInstalledShop({ shopDomain, accessTokenCiphertext, scopes: scope });

    logger.info({ shopDomain }, "shop installed");

    const redirectUrl = new URL(shopifyConfig.appUrl);
    redirectUrl.searchParams.set("shop", shopDomain);
    if (typeof host === "string" && host.length > 0) {
      redirectUrl.searchParams.set("host", host);
    }

    res.redirect(302, redirectUrl.toString());
  } catch (err) {
    if (err instanceof InvalidShopDomainError) {
      next(new ValidationError("A valid `shop` query parameter is required"));
      return;
    }
    if (err instanceof TokenExchangeError) {
      next(new AppError("Failed to complete Shopify installation", 502, "SHOPIFY_TOKEN_EXCHANGE_FAILED"));
      return;
    }
    next(err);
  }
});
