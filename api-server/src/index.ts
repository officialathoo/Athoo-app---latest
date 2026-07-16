import "dotenv/config";
import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocket } from "./ws";
import { startBookingSweeper, stopBookingSweeper } from "./lib/bookingSweeper";
import { shutdownQueue, startQueueWorker } from "./lib/queue";
import { assertDatabaseMigrationsCurrent } from "./lib/databaseMigrations";
import { startEmailMaintenance, stopEmailMaintenance } from "./lib/emailDelivery";

const rawPort = process.env["PORT"] || "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// Production-safe timeouts. Values are validated and ordered so a client cannot
// keep an incomplete header/request alive longer than the configured request
// budget. Invalid deployment values fail startup instead of silently disabling
// the protection with NaN or extreme numbers.
function timeoutFromEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max} milliseconds`);
  }
  return value;
}

const requestTimeoutMs = timeoutFromEnv("SERVER_REQUEST_TIMEOUT_MS", 120_000, 5_000, 300_000);
const headersTimeoutMs = timeoutFromEnv("SERVER_HEADERS_TIMEOUT_MS", 60_000, 5_000, requestTimeoutMs);
const keepAliveTimeoutMs = timeoutFromEnv("SERVER_KEEP_ALIVE_TIMEOUT_MS", 15_000, 1_000, headersTimeoutMs - 1);
server.requestTimeout = requestTimeoutMs;
server.headersTimeout = headersTimeoutMs;
server.keepAliveTimeout = keepAliveTimeoutMs;
setupWebSocket(server);

async function startServer(): Promise<void> {
  await assertDatabaseMigrationsCurrent();
  server.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    startQueueWorker();
    startEmailMaintenance();
    startBookingSweeper();
    logger.info("bookingSweeper started (5-min no-show cancel, 1-min interval)");
  });
}

startServer().catch((err) => {
  logger.error({ err }, "failed to start server");
  process.exit(1);
});



async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutdown signal received");
  stopBookingSweeper();
  stopEmailMaintenance();
  const serverClosed = new Promise<void>((resolve) => {
    server.close((error?: Error) => {
      if (error) logger.error({ err: error }, "error while closing HTTP server");
      resolve();
    });
  });
  const timeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10_000);
  const queueDrained = await shutdownQueue(Math.max(1000, timeoutMs - 1000));
  if (!queueDrained) logger.warn("background queue did not fully drain before shutdown timeout");
  await serverClosed;
  logger.info({ queueDrained }, "server closed cleanly");
  process.exit(queueDrained ? 0 : 1);
}

process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaught exception");
  void shutdown("uncaughtException");
});
