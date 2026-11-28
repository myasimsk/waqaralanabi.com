import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { db } from "../db/pool.js";
import { requireCustomer } from "./account.js";
import { requireAdmin } from "./admin.js";

const selection = z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(10) });
const photoSchema = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.base64().min(4).max(2_800_000),
});
const photoPair = z.object({ front: photoSchema, back: photoSchema });
const returnLine = selection.extend({ photos: z.array(photoPair).min(1).max(10) })
  .refine(({quantity, photos}) => photos.length === quantity);
const requestSchema = z.object({
  requestId: z.string().uuid(),
  orderId: z.string().uuid(),
  kind: z.enum(["refund", "exchange"]),
  reason: z.string().trim().min(3).max(500),
  eligibleCondition: z.literal(true),
  items: z.array(returnLine).min(1).max(20),
  replacement: z.array(selection).max(20).default([]),
}).refine(({ kind, items, replacement }) =>
  new Set(items.map((item) => item.id)).size === items.length &&
  new Set(replacement.map((item) => item.id)).size === replacement.length &&
  (kind === "exchange" ? replacement.length > 0 : replacement.length === 0),
);
const reviewSchema = z.object({
  action: z.enum(["approve", "decline", "receive", "complete"]),
  note: z.string().trim().min(5).max(500),
  shippingMinor: z.number().int().min(0).max(1_000_000).optional(),
});

type ReturnableItem = {
  id: string;
  name: string;
  colour: string | null;
  size: string | null;
  quantity: number;
  lineMinor: string;
  remainingQuantity: number;
  remainingMinor: string;
};

type Replacement = {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  colour: string;
  size: string;
  price_minor: string;
  available: number;
  quantity: number;
};

type ReturnRequest = {
  id: string;
  customer_id: string;
  order_id: string;
  kind: "exchange" | "refund";
  status: "requested" | "approved" | "declined" | "received" | "completed";
  credit_minor: string;
  replacement_items: Replacement[];
  replacement_order_id: string | null;
  refund_minor: string | null;
  guest_email: string | null;
  shipping_address_snapshot: unknown;
};

const returnableItems = `
  WITH priced AS (
    SELECT i.*, SUM(i.line_total_minor) OVER (PARTITION BY i.order_id ORDER BY i.id) AS running,
           o.subtotal_minor, LEAST(o.discount_minor, o.subtotal_minor) AS discount
    FROM order_items i JOIN orders o ON o.id=i.order_id
    WHERE o.customer_id=$1 AND ($2::uuid IS NULL OR o.id=$2)
      AND o.status='delivered' AND o.payment_status='paid'
      AND o.delivered_at >= now() - interval '7 days'
  )
  SELECT i.order_id AS "orderId", i.id, i.product_name_snapshot AS name,
    i.color_snapshot AS colour, i.size_snapshot AS size, i.quantity,
    i.line_total_minor AS "lineMinor",
    (i.quantity-COALESCE(a.quantity,0))::int AS "remainingQuantity",
    (i.line_total_minor
      - COALESCE(floor(i.running*i.discount/NULLIF(i.subtotal_minor,0)),0)
      + COALESCE(floor((i.running-i.line_total_minor)*i.discount/NULLIF(i.subtotal_minor,0)),0)
      - COALESCE(a.credit,0))::bigint AS "remainingMinor"
  FROM priced i
  LEFT JOIN LATERAL (
    SELECT SUM(l.quantity) AS quantity, SUM(l.credit_minor) AS credit
    FROM order_return_items l JOIN order_return_requests r ON r.id=l.request_id
    WHERE l.order_item_id=i.id AND r.status<>'declined'
  ) a ON true
  ORDER BY i.id
`;

function decodePhoto(photo: z.infer<typeof photoSchema>) {
  const bytes = Buffer.from(photo.data, "base64");
  const valid = photo.mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    photo.mime === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) :
      bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return valid && bytes.length <= 2 * 1024 * 1024 ? bytes : null;
}

const requestsQuery = `
  SELECT r.id, r.kind, r.status, r.reason, r.credit_minor, r.shipping_minor, r.refund_minor,
    r.created_at, r.updated_at, r.admin_note, o.order_number, replacement.order_number AS replacement_order_number,
    replacement.total_minor AS replacement_total_minor, r.replacement_items,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', i.product_name_snapshot, 'size', i.size_snapshot,
        'colour', i.color_snapshot, 'quantity', l.quantity, 'creditMinor', l.credit_minor::text))
      FROM order_return_items l JOIN order_items i ON i.id=l.order_item_id WHERE l.request_id=r.id
    ), '[]'::jsonb) AS items
  , CASE WHEN $1::uuid IS NULL THEN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', p.id, 'unit', p.unit, 'side', p.side, 'name', i.product_name_snapshot)
      ORDER BY p.order_item_id, p.unit, CASE p.side WHEN 'front' THEN 0 ELSE 1 END)
    FROM order_return_photos p JOIN order_items i ON i.id=p.order_item_id WHERE p.request_id=r.id
  ), '[]'::jsonb) ELSE '[]'::jsonb END AS photos
  FROM order_return_requests r JOIN orders o ON o.id=r.order_id
  LEFT JOIN orders replacement ON replacement.id=r.replacement_order_id
  WHERE ($1::uuid IS NULL OR r.customer_id=$1)
  ORDER BY r.created_at DESC LIMIT 100
`;

async function rollback(client: PoolClient) {
  await client.query("ROLLBACK").catch(() => undefined);
}

export async function customerReturnRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const customer = await requireCustomer(request, reply);
    if (!customer) return;
    const [orders, items, requests] = await Promise.all([
      db.query(`SELECT id, order_number, delivered_at FROM orders
        WHERE customer_id=$1 AND status='delivered' AND payment_status='paid'
          AND delivered_at >= now() - interval '7 days'
        ORDER BY delivered_at DESC LIMIT 50`, [customer]),
      db.query<ReturnableItem & { orderId: string }>(returnableItems, [customer, null]),
      db.query(requestsQuery, [customer]),
    ]);
    return {
      orders: orders.rows.map((order) => ({ ...order, items: items.rows.filter((item) => item.orderId === order.id && item.remainingQuantity > 0) }))
        .filter((order) => order.items.length),
      requests: requests.rows,
    };
  });

  app.post("/", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const customer = await requireCustomer(request, reply);
    if (!customer) return;
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Choose the items, attach front and back photos for each unit, and confirm the item condition." });
    const input = parsed.data;
    const photos = input.items.flatMap(line => line.photos.flatMap((pair, index) =>
      (["front", "back"] as const).map(side => ({
        item: line.id, unit: index + 1, side, mime: pair[side].mime, bytes: decodePhoto(pair[side]),
      })),
    ));
    if (photos.some(photo => !photo.bytes) || photos.reduce((sum, photo) => sum + (photo.bytes?.length ?? 0), 0) > 5 * 1024 * 1024) {
      return reply.code(400).send({ message: "Upload JPG, PNG or WebP photos up to 2 MB each and 5 MB total." });
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // Serialise claims against the same original order, including concurrent requests.
      await client.query("SELECT id FROM orders WHERE id=$1 AND customer_id=$2 FOR UPDATE", [input.orderId, customer]);
      const existing = await client.query<{ credit_minor: string }>("SELECT credit_minor FROM order_return_requests WHERE id=$1 AND customer_id=$2 AND order_id=$3", [input.requestId, customer, input.orderId]);
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return { id: input.requestId, creditMinor: existing.rows[0].credit_minor };
      }

      const items = await client.query<ReturnableItem>(returnableItems, [customer, input.orderId]);
      const claims = input.items.flatMap((line) => {
        const item = items.rows.find((row) => row.id === line.id);
        if (!item || line.quantity > item.remainingQuantity) return [];
        const credit = BigInt(item.remainingMinor) * BigInt(line.quantity) / BigInt(item.remainingQuantity);
        return [{ ...line, credit }];
      });
      if (claims.length !== input.items.length) {
        await rollback(client);
        return reply.code(409).send({ message: "Some selected items are unavailable for return. Check the available quantities and the seven-day deadline." });
      }
      const creditMinor = claims.reduce((total, line) => total + line.credit, 0n);
      let replacement: Replacement[] = [];
      if (input.kind === "exchange") {
        const catalogue = await client.query<Omit<Replacement, "quantity">>(
          `SELECT v.id, v.product_id, p.name, v.sku, v.colour, v.size, p.price_minor,
             v.stock_on_hand-v.reserved_quantity AS available
           FROM product_variants v JOIN catalog_products p ON p.id=v.product_id
           WHERE v.id=ANY($1::uuid[]) AND p.is_active AND v.is_active AND p.currency='PKR'`,
          [input.replacement.map((line) => line.id)],
        );
        replacement = input.replacement.flatMap((line) => {
          const variant = catalogue.rows.find((item) => item.id === line.id);
          return variant && variant.available >= line.quantity ? [{ ...variant, quantity: line.quantity }] : [];
        });
        if (replacement.length !== input.replacement.length) {
          await rollback(client);
          return reply.code(409).send({ message: "A replacement option is unavailable. Choose another size or colour." });
        }
      }

      await client.query(
        `INSERT INTO order_return_requests (id, customer_id, order_id, kind, reason, credit_minor, replacement_items)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [input.requestId, customer, input.orderId, input.kind, input.reason, creditMinor.toString(), JSON.stringify(replacement)],
      );
      for (const claim of claims) {
        await client.query("INSERT INTO order_return_items (request_id,order_item_id,quantity,credit_minor) VALUES ($1,$2,$3,$4)",
          [input.requestId, claim.id, claim.quantity, claim.credit.toString()]);
      }
      for (const photo of photos) {
        await client.query(
          "INSERT INTO order_return_photos (request_id,order_item_id,unit,side,mime_type,file_bytes) VALUES ($1,$2,$3,$4,$5,$6)",
          [input.requestId, photo.item, photo.unit, photo.side, photo.mime, photo.bytes],
        );
      }
      await client.query("COMMIT");
      return reply.code(201).send({ id: input.requestId, creditMinor: creditMinor.toString() });
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  });
}

async function createReplacementOrder(client: PoolClient, request: ReturnRequest, shipping: number) {
  const lines = request.replacement_items;
  const stock = await client.query<{ id: string; available: number }>(
    `SELECT v.id, v.stock_on_hand-v.reserved_quantity AS available
     FROM product_variants v JOIN catalog_products p ON p.id=v.product_id
     WHERE v.id=ANY($1::uuid[]) AND v.is_active AND p.is_active ORDER BY v.id FOR UPDATE OF v`,
    [lines.map((line) => line.id)],
  );
  if (lines.some((line) => (stock.rows.find((item) => item.id === line.id)?.available ?? 0) < line.quantity)) return null;
  const subtotal = lines.reduce((total, line) => total + BigInt(line.price_minor) * BigInt(line.quantity), 0n);
  const credit = BigInt(request.credit_minor);
  const discount = credit > subtotal ? subtotal : credit;
  const due = subtotal - discount + BigInt(shipping);
  const number = "WAT-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomBytes(5).toString("hex").toUpperCase();
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO orders (order_number,customer_id,guest_email,currency,subtotal_minor,discount_minor,
      shipping_minor,total_minor,status,payment_status,shipping_address_snapshot,payment_method)
     VALUES ($1,$2,$3,'PKR',$4,$5,$6,$7,'confirmed','pending',$8::jsonb,'cod') RETURNING id`,
    [number, request.customer_id, request.guest_email, subtotal.toString(), discount.toString(),
      shipping, due.toString(), JSON.stringify(request.shipping_address_snapshot)],
  );
  const orderId = inserted.rows[0]!.id;
  for (const line of lines) {
    await client.query(
      `INSERT INTO order_items (order_id,product_id,variant_id,product_name_snapshot,sku_snapshot,
        size_snapshot,color_snapshot,quantity,unit_price_minor,line_total_minor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [orderId, line.product_id, line.id, line.name, line.sku, line.size, line.colour, line.quantity, line.price_minor,
        (BigInt(line.price_minor)*BigInt(line.quantity)).toString()],
    );
    await client.query("UPDATE product_variants SET reserved_quantity=reserved_quantity+$1, updated_at=now() WHERE id=$2", [line.quantity, line.id]);
  }
  await client.query("INSERT INTO payments (order_id,provider,amount_minor,currency,status) VALUES ($1,'cod',$2,'PKR','pending')", [orderId, due.toString()]);
  return { orderId, unusedCredit: credit - discount };
}

export async function adminReturnRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    if (!["owner", "manager", "support"].includes(admin.role)) return reply.code(403).send({ message: "Returns access is restricted." });
    return { requests: (await db.query(requestsQuery, [null])).rows };
  });

  app.get<{ Params: { id: string; photoId: string } }>("/:id/photos/:photoId", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    if (!["owner", "manager", "support"].includes(admin.role)) return reply.code(403).send({ message: "Returns access is restricted." });
    const ids = z.object({id: z.string().uuid(), photoId: z.string().uuid()}).safeParse(request.params);
    if (!ids.success) return reply.code(404).send({ message: "Photo not found." });
    const { rows: [photo] } = await db.query<{mime_type: string; file_bytes: Buffer}>(
      "SELECT mime_type, file_bytes FROM order_return_photos WHERE request_id=$1 AND id=$2", [ids.data.id, ids.data.photoId],
    );
    if (!photo) return reply.code(404).send({ message: "Photo not found." });
    return reply.type(photo.mime_type).header("Cache-Control","private, no-store")
      .header("X-Content-Type-Options","nosniff").send(photo.file_bytes);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    if (!["owner", "manager"].includes(admin.role)) return reply.code(403).send({ message: "Only an owner or manager can review requests." });
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = reviewSchema.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ message: "Enter a valid review note and shipping amount." });
    const { action, note, shippingMinor } = parsed.data;
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const { rows: [record] } = await client.query<ReturnRequest>(
        `SELECT r.*, o.guest_email, o.shipping_address_snapshot
         FROM order_return_requests r JOIN orders o ON o.id=r.order_id WHERE r.id=$1 FOR UPDATE OF r`, [id.data]);
      if (!record) {
        await rollback(client);
        return reply.code(404).send({ message: "Request not found." });
      }
      const next = record.status === "requested" ? { approve: "approved", decline: "declined" } :
        record.status === "approved" ? { receive: "received" } : record.status === "received" ? { complete: "completed" } : {};
      const status = (next as Partial<Record<typeof action, string>>)[action];
      if (!status) {
        await rollback(client);
        return reply.code(409).send({ message: "This action is unavailable at the current request stage." });
      }
      if (action === "approve") {
        const { rows: [evidence] } = await client.query<{ complete: boolean }>(
          "SELECT NOT EXISTS (SELECT 1 FROM order_return_items i WHERE i.request_id=$1 AND i.quantity*2 <> (SELECT count(*) FROM order_return_photos p WHERE p.request_id=i.request_id AND p.order_item_id=i.order_item_id)) AS complete",
          [record.id],
        );
        if (!evidence?.complete) {
          await rollback(client);
          return reply.code(409).send({ message: "Front and back photos are required before approval." });
        }
      }
      let replacement = null;
      if (action === "approve" && record.kind === "exchange") {
        if (shippingMinor === undefined) {
          await rollback(client);
          return reply.code(400).send({ message: "Confirm the courier charge before creating the replacement order." });
        }
        replacement = await createReplacementOrder(client, record, shippingMinor);
        if (!replacement) {
          await rollback(client);
          return reply.code(409).send({ message: "Replacement stock has changed. Decline the request or wait for stock before approving." });
        }
      }
      await client.query(
        `UPDATE order_return_requests SET status=$2, admin_note=$3,
          replacement_order_id=COALESCE($4,replacement_order_id), shipping_minor=COALESCE($5,shipping_minor),
          refund_minor=COALESCE($6,refund_minor), updated_at=now() WHERE id=$1`,
        [record.id, status, note, replacement?.orderId ?? null, replacement ? shippingMinor : null,
          replacement?.unusedCredit.toString() ?? (record.kind === "refund" ? record.credit_minor : null)],
      );
      await client.query(
        "INSERT INTO admin_audit_logs (admin_user_id,action,entity_type,entity_id,reason) VALUES ($1,$2,'order_return_request',$3,$4)",
        [admin.id, "return." + status, record.id, note],
      );
      await client.query("COMMIT");
      return { status, replacementOrderId: replacement?.orderId ?? record.replacement_order_id, testOnly: true };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  });
}
