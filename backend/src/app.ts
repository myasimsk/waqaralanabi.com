import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { db } from "./db/pool.js";
import { authRoutes } from "./routes/auth.js";
import { accountRoutes } from "./routes/account.js";
import { addressRoutes } from "./routes/addresses.js";
import { adminRoutes } from "./routes/admin.js";
import { catalogRoutes, inventoryRoutes } from "./routes/catalog.js";
import { newsletterRoutes } from "./routes/newsletter.js";
import { checkoutRoutes, orderAdminRoutes } from "./routes/checkout.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    trustProxy: false,
    bodyLimit: 7_500_000,
  });

  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, {
    origin: env.STOREFRONT_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  // Reject cross-origin browser mutations before they reach authenticated routes.
  // SameSite cookies remain enabled as a second layer; non-browser clients without
  // Origin / Fetch Metadata headers can still use the API normally.
  const storefrontOrigin = new URL(env.STOREFRONT_ORIGIN).origin;
  app.addHook("onRequest", async (request, reply) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
    const origin = request.headers.origin;
    const fetchSite = request.headers["sec-fetch-site"];
    if (origin && origin !== storefrontOrigin) {
      return reply.code(403).send({
        error: "CROSS_ORIGIN_REQUEST_BLOCKED",
        message: "This request origin is not allowed.",
      });
    }
    if (fetchSite === "cross-site") {
      return reply.code(403).send({
        error: "CROSS_SITE_REQUEST_BLOCKED",
        message: "Cross-site browser requests are not allowed.",
      });
    }
  });

  // Account, authentication and admin responses may contain personal or
  // operational data; browsers and intermediaries must not cache them.
  app.addHook("onSend", async (request, reply, payload) => {
    if (/^\/(auth|account|admin)(\/|\?|$)/.test(request.url)) {
      reply.header("Cache-Control", "private, no-store, max-age=0");
      reply.header("Pragma", "no-cache");
    }
    return payload;
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "waqar-al-anabi-api",
  }));
    app.get("/ready", async (_request, reply) => {
    try {
      await db.query("SELECT 1");
      return { status: "ready", database: "connected" };
    } catch (error) {
      app.log.error({ err: error }, "Database readiness check failed");
      return reply.code(503).send({
        status: "not_ready",
        database: "unavailable",
      });
    }
  });

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(accountRoutes, { prefix: "/account" });
  await app.register(addressRoutes, { prefix: "/account/addresses" });
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(catalogRoutes);
  await app.register(newsletterRoutes);
  await app.register(checkoutRoutes);
  await app.register(orderAdminRoutes, { prefix: "/admin/orders" });
  await app.register(inventoryRoutes, { prefix: "/admin/inventory" });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: "NOT_FOUND",
      message: "The requested resource was not found.",
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error");

    const errorStatus =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;

    const status = errorStatus >= 400 ? errorStatus : 500;
    const message =
      error instanceof Error ? error.message : "A request error occurred.";

    return reply.code(status).send({
      error: status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR",
      message: status >= 500 ? "An unexpected error occurred." : message,
    });
  });

  return app;
}
