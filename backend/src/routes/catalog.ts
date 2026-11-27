import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/pool.js";
import { requireAdmin } from "./admin.js";

const slugSchema = z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  description: z.string().trim().max(3000).default(""),
  category: z.enum(["Men", "Women", "Unisex"]),
  priceMinor: z.number().int().nonnegative().max(100_000_000),
  currency: z.string().length(3).default("PKR"),
  imageUrl: z.string().url().max(1000).nullable().optional(),
  imageUrls: z.array(z.string().url().max(1000)).max(8).default([]),
  isActive: z.boolean().default(false),
});
const variantSchema = z.object({
  sku: z.string().trim().min(3).max(80),
  colour: z.string().trim().min(2).max(60),
  size: z.enum(["S", "M", "L", "XL"]),
  stockOnHand: z.number().int().min(0).max(1_000_000).default(0),
  lowStockThreshold: z.number().int().min(0).max(100_000).default(3),
});
const stockSchema = z.object({
  stockOnHand: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().min(5).max(500),
});
const idSchema = z.string().uuid();

async function managerOnly(request: Parameters<typeof requireAdmin>[0], reply: Parameters<typeof requireAdmin>[1]) {
  const admin = await requireAdmin(request, reply);
  if (!admin) return null;
  if (admin.role !== "owner" && admin.role !== "manager") {
    reply.code(403).send({ error: "INSUFFICIENT_PERMISSIONS", message: "Only owners and managers can manage catalogue and inventory." });
    return null;
  }
  return admin;
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/catalog", async () => {
    const result = await db.query(
      `SELECT p.id, p.name, p.slug, p.description, p.category, p.price_minor,
              p.currency, p.image_url, p.image_urls, p.updated_at,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id', v.id, 'sku', v.sku, 'colour', v.colour, 'size', v.size,
                'available', (v.is_active AND v.stock_on_hand > v.reserved_quantity)
              ) ORDER BY v.colour, v.size) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb) AS variants
         FROM catalog_products p
         LEFT JOIN product_variants v ON v.product_id = p.id AND v.is_active = true
        WHERE p.is_active = true
        GROUP BY p.id
        ORDER BY p.category, p.name`,
    );
    return { products: result.rows };
  });

  app.get<{ Params: { slug: string } }>("/catalog/:slug", async (request, reply) => {
    const slug = slugSchema.safeParse(request.params.slug);
    if (!slug.success) return reply.code(400).send({ error: "INVALID_PRODUCT_SLUG" });
    const result = await db.query(
      `SELECT p.id, p.name, p.slug, p.description, p.category, p.price_minor,
              p.currency, p.image_url, p.updated_at,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id', v.id, 'sku', v.sku, 'colour', v.colour, 'size', v.size,
                'available', (v.is_active AND v.stock_on_hand > v.reserved_quantity)
              ) ORDER BY v.colour, v.size) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb) AS variants
         FROM catalog_products p
         LEFT JOIN product_variants v ON v.product_id = p.id AND v.is_active = true
        WHERE p.slug = $1 AND p.is_active = true
        GROUP BY p.id LIMIT 1`,
      [slug.data],
    );
    if (!result.rowCount) return reply.code(404).send({ error: "PRODUCT_NOT_FOUND" });
    return { product: result.rows[0] };
  });
}

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const result = await db.query(
      `SELECT p.id AS product_id, p.name, p.slug, p.description, p.category, p.price_minor, p.currency, p.image_url, p.image_urls, p.is_active AS product_active,
              v.id AS variant_id, v.sku, v.colour, v.size, v.stock_on_hand, v.reserved_quantity,
              (v.stock_on_hand - v.reserved_quantity) AS available_quantity,
              v.low_stock_threshold, v.is_active AS variant_active,
              (v.stock_on_hand - v.reserved_quantity) <= v.low_stock_threshold AS low_stock
         FROM catalog_products p LEFT JOIN product_variants v ON v.product_id = p.id
        ORDER BY p.created_at DESC, p.name, v.colour, v.size`,
    );
    return { inventory: result.rows };
  });

  app.post("/products", async (request, reply) => {
    const admin = await managerOnly(request, reply);
    if (!admin) return;
    const parsed = productSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PRODUCT", details: parsed.error.flatten() });
    const p = parsed.data;
    try {
      const result = await db.query(
        `INSERT INTO catalog_products (name, slug, description, category, price_minor, currency, image_url, image_urls, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, name, slug, category, price_minor, currency, is_active`,
        [p.name,p.slug,p.description,p.category,p.priceMinor,p.currency.toUpperCase(),p.imageUrls[0] ?? p.imageUrl ?? null,p.imageUrls,p.isActive],
      );
      return reply.code(201).send({ product: result.rows[0] });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "PRODUCT_SLUG_EXISTS", message: "A product with this slug already exists." });
      }
      throw error;
    }
  });


  app.patch<{ Params: { productId: string } }>("/products/:productId", async (request, reply) => {
    const admin = await managerOnly(request, reply);
    if (!admin) return;
    const id = idSchema.safeParse(request.params.productId);
    const parsed = productSchema.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: "INVALID_PRODUCT", details: parsed.success ? undefined : parsed.error.flatten() });
    const p = parsed.data;
    try {
      const result = await db.query(
        `UPDATE catalog_products
            SET name=$1, slug=$2, description=$3, category=$4, price_minor=$5,
                currency=$6, image_url=$7, image_urls=$8, is_active=$9, updated_at=now()
          WHERE id=$10
          RETURNING id, name, slug, description, category, price_minor, currency, image_url, image_urls, is_active`,
        [p.name,p.slug,p.description,p.category,p.priceMinor,p.currency.toUpperCase(),p.imageUrls[0] ?? p.imageUrl ?? null,p.imageUrls,p.isActive,id.data],
      );
      if (!result.rowCount) return reply.code(404).send({ error: "PRODUCT_NOT_FOUND" });
      return { product: result.rows[0] };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "PRODUCT_SLUG_EXISTS", message: "A product with this slug already exists." });
      }
      throw error;
    }
  });

  app.post<{ Params: { productId: string } }>("/products/:productId/variants", async (request, reply) => {
    const admin = await managerOnly(request, reply);
    if (!admin) return;
    const id = idSchema.safeParse(request.params.productId);
    const parsed = variantSchema.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: "INVALID_VARIANT", details: parsed.success ? undefined : parsed.error.flatten() });
    const v = parsed.data;
    try {
      const result = await db.query(
        `INSERT INTO product_variants (product_id, sku, colour, size, stock_on_hand, low_stock_threshold)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, product_id, sku, colour, size, stock_on_hand, reserved_quantity, low_stock_threshold`,
        [id.data,v.sku,v.colour,v.size,v.stockOnHand,v.lowStockThreshold],
      );
      return reply.code(201).send({ variant: result.rows[0] });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "VARIANT_ALREADY_EXISTS", message: "That SKU or colour and size combination already exists." });
      }
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23503") {
        return reply.code(404).send({ error: "PRODUCT_NOT_FOUND" });
      }
      throw error;
    }
  });


  app.patch<{ Params: { variantId: string } }>("/variants/:variantId", async (request, reply) => {
    const admin = await managerOnly(request, reply);
    if (!admin) return;
    const id = idSchema.safeParse(request.params.variantId);
    const parsed = z.object({
      sku: z.string().trim().min(3).max(80),
      colour: z.string().trim().min(2).max(60),
      size: z.enum(["S", "M", "L", "XL"]),
      lowStockThreshold: z.number().int().min(0).max(100_000),
      isActive: z.boolean(),
    }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: "INVALID_VARIANT", details: parsed.success ? undefined : parsed.error.flatten() });
    const v = parsed.data;
    try {
      const result = await db.query(
        `UPDATE product_variants
            SET sku=$1, colour=$2, size=$3, low_stock_threshold=$4, is_active=$5, updated_at=now()
          WHERE id=$6
          RETURNING id, product_id, sku, colour, size, stock_on_hand, reserved_quantity, low_stock_threshold, is_active`,
        [v.sku,v.colour,v.size,v.lowStockThreshold,v.isActive,id.data],
      );
      if (!result.rowCount) return reply.code(404).send({ error: "VARIANT_NOT_FOUND" });
      return { variant: result.rows[0] };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "VARIANT_ALREADY_EXISTS", message: "That SKU or colour and size combination already exists for this product." });
      }
      throw error;
    }
  });

  app.patch<{ Params: { variantId: string } }>("/variants/:variantId/stock", async (request, reply) => {
    const admin = await managerOnly(request, reply);
    if (!admin) return;
    const id = idSchema.safeParse(request.params.variantId);
    const parsed = stockSchema.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: "INVALID_STOCK_UPDATE" });
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ stock_on_hand: number; reserved_quantity: number }>(
        "SELECT stock_on_hand, reserved_quantity FROM product_variants WHERE id = $1 FOR UPDATE", [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "VARIANT_NOT_FOUND" });
      }
      if (parsed.data.stockOnHand < current.rows[0]!.reserved_quantity) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "STOCK_BELOW_RESERVED", message: "Available stock cannot be reduced below the quantity already reserved." });
      }
      await client.query("UPDATE product_variants SET stock_on_hand = $1, updated_at = now() WHERE id = $2", [parsed.data.stockOnHand,id.data]);
      await client.query(
        `INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1,'inventory.stock_adjusted','product_variant',$2,$3,$4::jsonb)`,
        [admin.id,id.data,parsed.data.reason,JSON.stringify({ previousStock: current.rows[0]!.stock_on_hand, newStock: parsed.data.stockOnHand })],
      );
      await client.query("COMMIT");
      return { status: "updated", variantId: id.data, stockOnHand: parsed.data.stockOnHand, reservedQuantity: current.rows[0]!.reserved_quantity };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      request.log.error({ err: error }, "Inventory stock update failed");
      return reply.code(500).send({ error: "STOCK_UPDATE_FAILED" });
    } finally {
      client.release();
    }
  });

  app.patch<{ Params: { productId: string } }>("/products/:productId/status", async (request, reply) => {
    const admin = await managerOnly(request, reply);
    if (!admin) return;
    const id = idSchema.safeParse(request.params.productId);
    const parsed = z.object({ isActive: z.boolean() }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: "INVALID_PRODUCT_STATUS" });
    const result = await db.query(
      "UPDATE catalog_products SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING id, is_active",
      [parsed.data.isActive,id.data],
    );
    if (!result.rowCount) return reply.code(404).send({ error: "PRODUCT_NOT_FOUND" });
    return { product: result.rows[0] };
  });
}
