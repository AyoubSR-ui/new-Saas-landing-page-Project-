import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { createApp } from "./app.js";
import { pool } from "./db/pool.js";
import { prisma } from "./db/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "server listening");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  server.close();
  await Promise.all([pool.end(), prisma.$disconnect()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
