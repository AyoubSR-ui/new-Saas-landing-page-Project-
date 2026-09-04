import { Router } from "express";
import { z } from "zod";
import { NotFoundError, ValidationError } from "../../../utils/errors.js";
import { requireShopAuth } from "../auth/requireShopAuth.js";
import { findProductByIdForShop, findProductsByShop } from "./productRepository.js";
import { toProductDetailResponse, toProductListResponse, toProductSyncResponse } from "./productContracts.js";
import { syncShopProducts } from "./productSync.js";

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

// POST /api/products/sync — triggers a sync for the authenticated shop only;
// there is no way to pass a target shop, by design.
productsRouter.post("/sync", async (req, res, next) => {
  try {
    const result = await syncShopProducts({ id: req.shop!.id, shopDomain: req.shop!.shopDomain });
    res.status(200).json(toProductSyncResponse(result));
  } catch (err) {
    next(err);
  }
});
