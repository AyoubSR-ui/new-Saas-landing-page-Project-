import { Router } from "express";
import { requireShopAuth } from "./auth/requireShopAuth.js";

export const sessionRouter = Router();

// GET /api/shopify/session — the minimal authenticated endpoint the
// embedded client shell calls to prove session-token auth is wired up.
sessionRouter.get("/session", requireShopAuth, (req, res) => {
  res.status(200).json({ status: "authenticated", shop: req.shop?.shopDomain });
});
