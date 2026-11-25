import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { db } from "./db/pool.js";
export async function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL }, trustProxy: false, bodyLimit: 1_048_576 });
  await app.register(helmet);
  await app.register(cors, { origin: env.STOREFRONT_ORIGIN, credentials: true, methods: ["GET","POST","PATCH","DELETE","OPTIONS"] });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.get("/health", async () => ({ status: "ok", service: "waqar-al-anabi-api", environment: env.NODE_ENV }));
  app.get("/ready", async (_request, reply) => {
    try { await db.query("SELECT 1"); return { status: "ready", database: "connected" }; }
    catch { return reply.code(503).send({ status: "not_ready", database: "unavailable" }); }
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "NOT_FOUND", message: "The requested resource was not found." }));
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error");
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return reply.code(status).send({ error: status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR", message: status >= 500 ? "An unexpected error occurred." : error.message });
  });
  return app;
}
