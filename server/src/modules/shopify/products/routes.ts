import { Router } from "express";
import { z } from "zod";
import { AppError, NotFoundError, ValidationError } from "../../../utils/errors.js";
import { requireShopAuth } from "../auth/requireShopAuth.js";
import { ShopifyApiError, ShopNotInstalledError } from "../client/shopifyClient.js";
import { TokenDecryptionError } from "../security/tokenCipher.js";
import { findProductByIdForShop, findProductsByShop } from "./productRepository.js";
import { toProductDetailResponse, toProductListResponse, toProductSyncResponse } from "./productContracts.js";
import { syncShopProducts } from "./productSync.js";
import { ShopifyProductAdapterError } from "./shopifyProductAdapter.js";

export const productsRouter = Router();

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const ListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).optional(),
});

// Every route below is authenticated via the same Phase 1 session-token
// middleware used for the rest of the embedded app — the tenant boundary
// (req.shop.id) always comes from the verified token, never from a
// query/body/param value the client controls.
productsRouter.use(requireShopAuth);

// GET /api/products
productsRouter.get("/", async (req, res, next) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid `cursor` or `limit` query parameter");
    }

    const { items, nextCursor } = await findProductsByShop(req.shop!.id, {
      cursor: parsed.data.cursor,
      limit: parsed.data.limit ?? DEFAULT_PAGE_LIMIT,
    });

    res.status(200).json(toProductListResponse(items, nextCursor));
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
productsRouter.get("/:id", async (req, res, next) => {
  try {
    const product = await findProductByIdForShop(req.shop!.id, req.params.id as string);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    res.status(200).json(toProductDetailResponse(product));
  } catch (err) {
    next(err);
  }
});

/**
 * The sync pipeline's own error types (ShopNotInstalledError, ShopifyApiError,
 * ShopifyProductAdapterError, TokenDecryptionError) never extended AppError,
 * so errorHandler's production branch collapsed every one of them — a missing
 * OAuth scope, a malformed Shopify response, a corrupted token — into the
 * same opaque "Internal server error". Mapping them here surfaces the real
 * cause without changing the sync logic itself. Messages passed through are
 * already secret-free (see ShopifyApiError/ShopifyProductAdapterError call
 * sites) — never the token or ciphertext.
 */
function toProductSyncError(err: unknown): unknown {
  if (err instanceof ShopNotInstalledError) {
    return new AppError(err.message, 403, "SHOP_NOT_INSTALLED");
  }
  if (err instanceof ShopifyApiError) {
    return new AppError(`Shopify rejected the product sync request: ${err.message}`, 502, "SHOPIFY_API_ERROR");
  }
  if (err instanceof ShopifyProductAdapterError) {
    return new AppError(`Shopify product sync failed: ${err.message}`, 502, "SHOPIFY_SYNC_ERROR");
  }
  if (err instanceof TokenDecryptionError) {
    return new AppError("Stored Shopify access token could not be decrypted", 500, "TOKEN_DECRYPTION_ERROR");
  }
  return err;
}

// POST /api/products/sync — triggers a sync for the authenticated shop only;
// there is no way to pass a target shop, by design.
productsRouter.post("/sync", async (req, res, next) => {
  try {
    const result = await syncShopProducts({ id: req.shop!.id, shopDomain: req.shop!.shopDomain });
    res.status(200).json(toProductSyncResponse(result));
  } catch (err) {
    next(toProductSyncError(err));
  }
});
