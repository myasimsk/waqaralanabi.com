import pg from "pg";
import { env } from "../config/env.js";
const { Pool } = pg;
export const db = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "waqar-al-anabi-api"
});
db.on("error", (error) => console.error("Unexpected idle PostgreSQL client error", error));
