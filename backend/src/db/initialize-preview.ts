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
    const { rows: [state] } = await client.query<{ initialized: boolean; hasTables: boolean }>(`
      SELECT to_regclass('wa_preview_initialization') IS NOT NULL AS initialized,
        EXISTS(SELECT FROM pg_tables WHERE schemaname = current_schema()) AS "hasTables"
    `);
    if (state?.initialized) {
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
