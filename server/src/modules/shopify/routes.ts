import { Router } from "express";
import { oauthRouter } from "./auth/oauthRoutes.js";
import { sessionRouter } from "./sessionRoutes.js";
import { webhookRouter } from "./webhooks/appUninstalled.js";

// Mounted at /api/shopify. Three distinct trust boundaries live side by
// side here on purpose (see README.md): unauthenticated OAuth endpoints,
// session-token-authenticated app endpoints, and HMAC-authenticated
// webhook endpoints. Each enforces its own auth — nothing upstream of this
// router assumes a request is trusted.
export const shopifyRouter = Router();

shopifyRouter.use(oauthRouter);
shopifyRouter.use(sessionRouter);
shopifyRouter.use(webhookRouter);
