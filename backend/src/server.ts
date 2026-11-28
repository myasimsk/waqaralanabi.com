import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./db/pool.js";
import { initializePreviewDatabase } from "./db/initialize-preview.js";
const app = await buildApp();
try { if (env.PREVIEW_CHECKOUT_ENABLED) await initializePreviewDatabase(); await app.listen({ host: env.HOST, port: env.PORT }); app.log.info({ host: env.HOST, port: env.PORT }, "WA backend listening"); }
catch (error) { app.log.error(error); process.exit(1); }
const shutdown = async (signal: string) => { app.log.info({ signal }, "Shutting down WA backend"); await app.close(); await db.end(); process.exit(0); };
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
