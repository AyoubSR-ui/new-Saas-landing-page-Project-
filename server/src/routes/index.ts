import { Router } from "express";
import { healthRouter } from "./health.js";

export const rootRouter = Router();

rootRouter.use(healthRouter);

// Mounted in later phases:
//   /api/shopify   (Phase 1)
//   /api/products  (Phase 2)
//   /api/pages     (Phase 3+)
//   /api/templates (Phase 7)
//   /api/ai        (Phase 6)
//   /api/analytics (Phase 10)
