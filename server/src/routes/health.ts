import { Router } from "express";
import { HealthCheckResponseSchema } from "@ecommerce-landing-saas/shared";
import { pool } from "../db/pool.js";
import { AppError } from "../utils/errors.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");

    const payload = HealthCheckResponseSchema.parse({
      status: "ok",
      service: "server",
      timestamp: new Date().toISOString(),
      database: "connected",
    });

    res.status(200).json(payload);
  } catch (err) {
    next(new AppError("Database is not reachable", 503, "DATABASE_UNAVAILABLE", { cause: err }));
  }
});
