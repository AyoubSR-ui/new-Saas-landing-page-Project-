import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
    requestId: req.requestId,
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appError = err instanceof AppError ? err : null;
  const statusCode = appError?.statusCode ?? 500;
  const code = appError?.code ?? "INTERNAL_ERROR";

  logger.error(
    {
      requestId: req.requestId,
      statusCode,
      code,
      err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    },
    "request failed",
  );

  const message =
    appError || env.NODE_ENV !== "production"
      ? (err instanceof Error ? err.message : "Unexpected error")
      : "Internal server error";

  res.status(statusCode).json({
    error: { code, message },
    requestId: req.requestId,
  });
}
