import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./utils/logger.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { rootRouter } from "./routes/index.js";
import { captureRawBody } from "./modules/shopify/webhooks/rawBody.js";

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

  app.use(rootRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
