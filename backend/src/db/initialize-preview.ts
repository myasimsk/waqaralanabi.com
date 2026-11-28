import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { db } from "./pool.js";

const catalogue = [
  ["polo", "Signature Polo Shirt", "Men", 6500, ["Black", "Burgundy", "White"]],
  ["pleated-trousers", "Relaxed Pleated Trousers", "Men", 8900, ["Black", "Beige", "Charcoal", "Brown"]],
  ["coord-set", "Women's Co-ord Set", "Women", 14500, ["Black", "Cream", "Chocolate Brown", "Burgundy"]],
  ["wide-leg-trousers", "Wide-Leg Trousers", "Women", 9200, ["Black", "Cream", "Taupe", "Chocolate"]],
  ["sweatshirt", "WA Signature Sweatshirt", "Unisex", 8500, ["Black", "Burgundy", "Beige"]],
  ["boxy-shirt", "Boxy-Fit Shirt", "Unisex", 7800, ["Black", "Burgundy", "Olive Green", "Beige"]],
  ["boxy-tee", "People Not Trends Boxy Tee", "Unisex", 4800, ["Black", "Burgundy", "Olive Green", "Beige"]],
] as const;
const sizes = ["S", "M", "L", "XL"] as const;

export async function initializePreviewDatabase() {
  const directory = new URL("../../database/", import.meta.url);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('wa-preview-initialization'))");
    const { rows: [state] } = await client.query<{ initialized: boolean; returnsReady: boolean; returnPhotosReady: boolean; hasTables: boolean }>(`
      SELECT to_regclass('wa_preview_initialization') IS NOT NULL AS initialized,
        to_regclass('order_return_requests') IS NOT NULL AS "returnsReady",
        to_regclass('order_return_photos') IS NOT NULL AS "returnPhotosReady",
        EXISTS(SELECT FROM pg_tables WHERE schemaname = current_schema()) AS "hasTables"
    `);
    if (state?.initialized) {
      if (!state.returnsReady) await client.query(await readFile(new URL("migrations/010_order_returns.sql", directory), "utf8"));
      if (!state.returnPhotosReady) await client.query(await readFile(new URL("migrations/011_return_photos.sql", directory), "utf8"));
      await client.query("COMMIT");
      return;
    }
    if (state?.hasTables) {
      throw new Error("Preview database initialization requires an empty schema.");
    }

    await client.query(await readFile(new URL("schema.sql", directory), "utf8"));
    const migrationsDirectory = new URL("migrations/", directory);
    const migrations = (await readdir(migrationsDirectory))
      .filter((file) => /^\d{3}_.+\.sql$/.test(file))
      .sort();
    for (const migration of migrations) {
      await client.query(await readFile(new URL(migration, migrationsDirectory), "utf8"));
    }
    for (const [slug, name, category, price, colours] of catalogue) {
      const product = await client.query<{ id: string }>(
        `INSERT INTO catalog_products (slug, name, category, price_minor, is_active)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [slug, name, category, price * 100],
      );
      for (const [index, colour] of colours.entries()) {
        for (const size of sizes) {
          const sku = ["WA-PREVIEW", slug.toUpperCase(), index + 1, size].join("-");
          await client.query(
            `INSERT INTO product_variants (product_id, sku, colour, size, stock_on_hand)
             VALUES ($1, $2, $3, $4, 10)`,
            [product.rows[0]!.id, sku, colour, size],
          );
        }
      }
    }
    await client.query("CREATE TABLE wa_preview_initialization (initialized_at timestamptz NOT NULL DEFAULT now())");
    await client.query("INSERT INTO wa_preview_initialization DEFAULT VALUES");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}


export async function initializePreviewAdmin() {
  const password = process.env.PREVIEW_ADMIN_PASSWORD;
  if (!password) return;
  if (password.length < 16 || password.length > 128) {
    throw new Error("The preview administrator password must be between 16 and 128 characters.");
  }
  const email = "admin@example.test";
  const existing = await db.query("SELECT 1 FROM admin_users WHERE email=$1", [email]);
  if (existing.rowCount) return;

  const salt = randomBytes(16);
  const derive = promisify(scrypt);
  const key = await derive(password, salt, 64) as Buffer;
  const passwordHash = `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
  await db.query(
    "INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, 'owner') ON CONFLICT (email) DO NOTHING",
    [email, passwordHash],
  );
}
