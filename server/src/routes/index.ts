import { Router } from "express";
import { healthRouter } from "./health.js";
import { shopifyRouter } from "../modules/shopify/routes.js";
import { productsRouter } from "../modules/shopify/products/routes.js";
import { landingPagesRouter } from "../modules/landingPages/routes.js";

export const rootRouter = Router();

rootRouter.use(healthRouter);
rootRouter.use("/api/shopify", shopifyRouter);
rootRouter.use("/api/products", productsRouter);
rootRouter.use("/api/landing-pages", landingPagesRouter);

// Mounted in later phases:
//   /api/templates (Phase 7)
//   /api/ai        (Phase 6)
//   /api/analytics (Phase 10)
