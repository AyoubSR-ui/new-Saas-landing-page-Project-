import { Router } from "express";
import { healthRouter } from "./health.js";
import { shopifyRouter } from "../modules/shopify/routes.js";

export const rootRouter = Router();

rootRouter.use(healthRouter);
rootRouter.use("/api/shopify", shopifyRouter);

// Mounted in later phases:
//   /api/products  (Phase 2)
//   /api/pages     (Phase 3+)
//   /api/templates (Phase 7)
//   /api/ai        (Phase 6)
//   /api/analytics (Phase 10)
