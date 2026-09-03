import pino from "pino";
import { env } from "../config/env.js";

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.accessToken",
  "*.shopifyAccessToken",
  "*.apiSecret",
  "*.password",
  "*.token",
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: REDACTED_PATHS,
    censor: "[REDACTED]",
  },
});
