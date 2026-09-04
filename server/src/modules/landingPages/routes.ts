import { Router } from "express";
import { z } from "zod";
import { CreateLandingPageInputSchema, UpdateLandingPageInputSchema } from "@ecommerce-landing-saas/shared";
import { ValidationError } from "../../utils/errors.js";
import { requireShopAuth } from "../shopify/auth/requireShopAuth.js";
import { toLandingPageDetailResponse, toLandingPageListResponse } from "./landingPageContracts.js";
import { createLandingPage, deleteLandingPage, getLandingPage, listLandingPages, updateLandingPage } from "./landingPageService.js";

export const landingPagesRouter = Router();

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const ListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).optional(),
});

// Every route below is authenticated via the same Phase 1 session-token
// middleware used for products and the rest of the embedded app — the
// tenant boundary (req.shop.id) always comes from the verified token, never
// from a query/body/param value the client controls.
landingPagesRouter.use(requireShopAuth);

// GET /api/landing-pages
landingPagesRouter.get("/", async (req, res, next) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid `cursor` or `limit` query parameter");
    }

    const { items, nextCursor } = await listLandingPages(req.shop!.id, {
      cursor: parsed.data.cursor,
      limit: parsed.data.limit ?? DEFAULT_PAGE_LIMIT,
    });

    res.status(200).json(toLandingPageListResponse(items, nextCursor));
  } catch (err) {
    next(err);
  }
});

// GET /api/landing-pages/:id
landingPagesRouter.get("/:id", async (req, res, next) => {
  try {
    const page = await getLandingPage(req.shop!.id, req.params.id as string);
    res.status(200).json(toLandingPageDetailResponse(page));
  } catch (err) {
    next(err);
  }
});

// POST /api/landing-pages — the shop is always req.shop.id from the
// verified token; a client-supplied shopId/shop in the body is ignored.
landingPagesRouter.post("/", async (req, res, next) => {
  try {
    const parsed = CreateLandingPageInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const page = await createLandingPage(req.shop!.id, parsed.data);
    res.status(201).json(toLandingPageDetailResponse(page));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/landing-pages/:id
landingPagesRouter.patch("/:id", async (req, res, next) => {
  try {
    const parsed = UpdateLandingPageInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const page = await updateLandingPage(req.shop!.id, req.params.id as string, parsed.data);
    res.status(200).json(toLandingPageDetailResponse(page));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/landing-pages/:id — soft delete; see landingPageRepository.ts.
landingPagesRouter.delete("/:id", async (req, res, next) => {
  try {
    await deleteLandingPage(req.shop!.id, req.params.id as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
