import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db/pool.js";

const SESSION_COOKIE = "wa_customer_session";

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function requireCustomer(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) {
    reply.code(401).send({ error: "AUTHENTICATION_REQUIRED", message: "Please sign in to view your account." });
    return null;
  }
  const result = await db.query<{ customer_id: string }>(
    `SELECT s.customer_id
       FROM customer_sessions s
       JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL
        AND s.expires_at > now() AND c.status = 'active'
      LIMIT 1`,
    [hashToken(token)],
  );
  if (result.rowCount !== 1) {
    reply.code(401).send({ error: "AUTHENTICATION_REQUIRED", message: "Your session has expired. Please sign in again." });
    return null;
  }
  await db.query("UPDATE customer_sessions SET last_seen_at = now() WHERE token_hash = $1", [hashToken(token)]);
  return result.rows[0]!.customer_id;
}

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
}).refine((value) => value.fullName !== undefined || value.phone !== undefined);

const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get("/profile", async (request, reply) => {
    const customerId = await requireCustomer(request, reply);
    if (!customerId) return;
    const result = await db.query(
      `SELECT id, email, full_name, phone, email_verified_at, created_at
         FROM customers WHERE id = $1`,
      [customerId],
    );
    const customer = result.rows[0];
    if (!customer) return reply.code(404).send({ error: "CUSTOMER_NOT_FOUND" });
    return {
      customer: {
        id: customer.id, email: customer.email, fullName: customer.full_name,
        phone: customer.phone, emailVerifiedAt: customer.email_verified_at,
        memberSince: customer.created_at,
      },
    };
  });

  app.patch("/profile", async (request, reply) => {
    const customerId = await requireCustomer(request, reply);
    if (!customerId) return;
    const parsed = profileUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_PROFILE", message: "Provide a valid name or phone number." });
    }
    const result = await db.query(
      `UPDATE customers
          SET full_name = COALESCE($1, full_name),
              phone = CASE WHEN $2::boolean THEN $3 ELSE phone END,
              updated_at = now()
        WHERE id = $4
        RETURNING id, email, full_name, phone`,
      [parsed.data.fullName ?? null, parsed.data.phone !== undefined, parsed.data.phone ?? null, customerId],
    );
    const customer = result.rows[0];
    if (!customer) return reply.code(404).send({ error: "CUSTOMER_NOT_FOUND" });
    return {
      status: "updated",
      customer: { id: customer.id, email: customer.email, fullName: customer.full_name, phone: customer.phone },
    };
  });

  app.get("/orders", async (request, reply) => {
    const customerId = await requireCustomer(request, reply);
    if (!customerId) return;
    const parsed = pageQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PAGINATION" });
    const { limit, offset } = parsed.data;
    const [orders, count] = await Promise.all([
      db.query(
        `SELECT o.id, o.order_number, o.currency, o.subtotal_minor,
                o.discount_minor, o.shipping_minor, o.tax_minor, o.total_minor,
                o.status, o.payment_status, o.payment_method, o.placed_at,
                (SELECT p.review_status FROM bank_transfer_proofs p
                 WHERE p.order_id=o.id ORDER BY p.uploaded_at DESC, p.id DESC LIMIT 1) AS receipt_status,
                COALESCE(jsonb_agg(jsonb_build_object(
                  'productName', oi.product_name_snapshot, 'sku', oi.sku_snapshot,
                  'size', oi.size_snapshot, 'color', oi.color_snapshot,
                  'quantity', oi.quantity, 'unitPriceMinor', oi.unit_price_minor,
                  'lineTotalMinor', oi.line_total_minor
                )) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb) AS items
           FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.customer_id = $1
          GROUP BY o.id ORDER BY o.placed_at DESC LIMIT $2 OFFSET $3`,
        [customerId, limit, offset],
      ),
      db.query<{ total: string }>("SELECT count(*)::text AS total FROM orders WHERE customer_id = $1", [customerId]),
    ]);
    return {
      orders: orders.rows,
      pagination: { limit, offset, total: Number(count.rows[0]?.total ?? 0) },
    };
  });

  app.get<{ Params: { orderNumber: string } }>("/orders/:orderNumber", async (request, reply) => {
    const customerId = await requireCustomer(request, reply);
    if (!customerId) return;
    const parsedNumber = z.string().trim().min(3).max(64).safeParse(request.params.orderNumber);
    if (!parsedNumber.success) return reply.code(400).send({ error: "INVALID_ORDER_NUMBER" });
    const result = await db.query(
      `SELECT o.id, o.order_number, o.currency, o.subtotal_minor,
              o.discount_minor, o.shipping_minor, o.tax_minor, o.total_minor,
              o.status, o.payment_status, o.placed_at, o.updated_at,
              o.shipping_address_snapshot, o.billing_address_snapshot,
              COALESCE(jsonb_agg(jsonb_build_object(
                'productName', oi.product_name_snapshot, 'sku', oi.sku_snapshot,
                'size', oi.size_snapshot, 'color', oi.color_snapshot,
                'quantity', oi.quantity, 'unitPriceMinor', oi.unit_price_minor,
                'lineTotalMinor', oi.line_total_minor
              )) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb) AS items
         FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id = $1 AND o.order_number = $2
        GROUP BY o.id LIMIT 1`,
      [customerId, parsedNumber.data],
    );
    if (result.rowCount !== 1) {
      return reply.code(404).send({ error: "ORDER_NOT_FOUND", message: "We could not find that order in your account." });
    }
    const payments = await db.query(
      `SELECT provider, amount_minor, currency, status, paid_at, created_at
         FROM payments WHERE order_id = $1 ORDER BY created_at DESC`,
      [result.rows[0]!.id],
    );
    return { order: result.rows[0], payments: payments.rows };
  });

  app.get("/loyalty", async (request, reply) => {
    const customerId = await requireCustomer(request, reply);
    if (!customerId) return;
    const result = await db.query(
      `SELECT la.points_balance::text AS points_balance,
              la.lifetime_earned::text AS lifetime_earned,
              COALESCE(SUM(lt.points) FILTER (WHERE lt.status = 'pending'), 0)::text AS pending_points,
              COALESCE(SUM(lt.points) FILTER (WHERE lt.status = 'available' AND lt.type = 'earn'), 0)::text AS available_earned,
              COALESCE(SUM(lt.points) FILTER (WHERE lt.status = 'redeemed'), 0)::text AS redeemed_points,
              COALESCE(SUM(lt.points) FILTER (WHERE lt.status = 'expired'), 0)::text AS expired_points
         FROM loyalty_accounts la
         LEFT JOIN loyalty_transactions lt ON lt.loyalty_account_id = la.id
        WHERE la.customer_id = $1 GROUP BY la.id`,
      [customerId],
    );
    const account = result.rows[0];
    if (!account) return reply.code(404).send({ error: "LOYALTY_ACCOUNT_NOT_FOUND", message: "Your loyalty account is not available yet." });
    return {
      loyalty: {
        balance: account.points_balance, lifetimeEarned: account.lifetime_earned,
        pendingPoints: account.pending_points, availableEarned: account.available_earned,
        redeemedPoints: account.redeemed_points, expiredPoints: account.expired_points,
      },
    };
  });

  app.get("/loyalty/transactions", async (request, reply) => {
    const customerId = await requireCustomer(request, reply);
    if (!customerId) return;
    const parsed = pageQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PAGINATION" });
    const result = await db.query(
      `SELECT lt.id, lt.type, lt.status, lt.points, lt.points_value_minor,
              lt.reason, lt.expires_at, lt.created_at, o.order_number
         FROM loyalty_transactions lt
         JOIN loyalty_accounts la ON la.id = lt.loyalty_account_id
         LEFT JOIN orders o ON o.id = lt.order_id
        WHERE la.customer_id = $1
        ORDER BY lt.created_at DESC LIMIT $2 OFFSET $3`,
      [customerId, parsed.data.limit, parsed.data.offset],
    );
    return { transactions: result.rows, pagination: parsed.data };
  });
}
