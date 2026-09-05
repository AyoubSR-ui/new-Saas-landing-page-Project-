import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { rootRouter } from "./routes/index.js";
import { captureRawBody } from "./modules/shopify/webhooks/rawBody.js";

// Resolved from this module's own location, not process.cwd() or a
// hard-coded path — `server/src/app.ts` and its compiled `server/dist/app.js`
// are both exactly two directories below the repo root, so the same
// relative path lands on `client/dist` whether this runs from source
// (dev/test) or from the built output (production).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_PATH = path.resolve(__dirname, "../../client/dist");

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  // `verify` captures the exact raw bytes of every request body before
  // JSON parsing, so Shopify webhook HMAC verification (which must run
  // against the untouched payload) works without a separate body-parsing
  // path for webhook routes.
  app.use(express.json({ verify: captureRawBody }));
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.requestId,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );

  // API/health routes are registered first and always win — nothing below
  // this line can ever intercept them, in any environment.
  app.use(rootRouter);

  // Production only: serve the Vite-built SPA. Skipped entirely in
  // development/test, where the client is either served by `vite` itself
  // (with its own /api proxy) or not needed at all — so this never requires
  // `client/dist` to exist outside production.
  if (env.NODE_ENV === "production") {
    app.use(express.static(CLIENT_DIST_PATH));

    // SPA fallback for browser-navigated frontend routes (e.g. /preview/123).
    // Never intercepts /api/* — those fall through to notFoundHandler below,
    // preserving the existing JSON 404 shape for unmatched API requests.
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(CLIENT_DIST_PATH, "index.html"), (err) => {
        if (err) next(err);
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
