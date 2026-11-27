import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db/pool.js";
import { env } from "../config/env.js";

const SESSION_COOKIE = "wa_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

type AdminRole = "owner" | "manager" | "support" | "fulfilment";
export type AdminIdentity = { id: string; email: string; role: AdminRole };

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, n, r, p, saltHex, keyHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || n !== "16384" || r !== "8" || p !== "1" || !saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await derivePasswordKey(password, salt);
  return timingSafeEqual(expected, actual);
}

function cookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<AdminIdentity | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) {
    reply.code(401).send({ error: "ADMIN_AUTHENTICATION_REQUIRED", message: "Please sign in to the admin panel." });
    return null;
  }

  const result = await db.query<{ id: string; email: string; role: AdminRole }>(
    `SELECT a.id, a.email, a.role
       FROM admin_sessions s
       JOIN admin_users a ON a.id = s.admin_user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL
        AND s.expires_at > now() AND a.is_active = true
      LIMIT 1`,
    [hashToken(token)],
  );

  const admin = result.rows[0];
  if (!admin) {
    reply.clearCookie(SESSION_COOKIE, cookieOptions()).code(401).send({
      error: "ADMIN_SESSION_EXPIRED",
      message: "Your admin session has expired. Please sign in again.",
    });
    return null;
  }

  await db.query("UPDATE admin_sessions SET last_seen_at = now() WHERE token_hash = $1", [hashToken(token)]);
  return admin;
}

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
const searchSchema = z.object({
  search: z.string().trim().max(254).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
const statusSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().min(5).max(500),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", message: "Enter a valid email and password." });

    const email = parsed.data.email.trim().toLowerCase();
    const result = await db.query<{ id: string; email: string; password_hash: string; role: AdminRole; is_active: boolean }>(
      "SELECT id, email, password_hash, role, is_active FROM admin_users WHERE lower(trim(email)) = $1 LIMIT 1",
      [email],
    );
    const admin = result.rows[0];
    const passwordMatches = admin ? await verifyPassword(parsed.data.password, admin.password_hash) : false;
    if (!admin || !admin.is_active || !passwordMatches) {
      return reply.code(401).send({ error: "INVALID_CREDENTIALS", message: "The email or password is incorrect." });
    }

    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '8 hours')",
      [admin.id, hashToken(token)],
    );
    return reply.setCookie(SESSION_COOKIE, token, cookieOptions()).send({
      status: "authenticated",
      admin: { id: admin.id, email: admin.email, role: admin.role },
    });
  });

  app.get("/me", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    return { admin };
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await db.query("UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [hashToken(token)]);
    }
    return reply.clearCookie(SESSION_COOKIE, cookieOptions()).send({ status: "signed_out" });
  });

  app.get("/customers", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_QUERY" });
    const { search = "", limit, offset } = parsed.data;
    const term = search.trim();
    const pattern = `%${term}%`;
    const result = await db.query(
      `SELECT c.id, c.email, c.full_name, c.phone, c.status, c.email_verified_at, c.created_at,
              COUNT(DISTINCT o.id)::int AS order_count,
              COALESCE(SUM(o.total_minor), 0)::text AS lifetime_order_value_minor,
              COALESCE(la.points_balance, 0)::text AS loyalty_points
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
         LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
        WHERE ($1 = '' OR c.email ILIKE $2 OR c.full_name ILIKE $2
               OR EXISTS (SELECT 1 FROM orders ox WHERE ox.customer_id = c.id AND ox.order_number ILIKE $2))
        GROUP BY c.id, la.points_balance
        ORDER BY c.created_at DESC
        LIMIT $3 OFFSET $4`,
      [term, pattern, limit, offset],
    );
    const count = await db.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM customers c
        WHERE ($1 = '' OR c.email ILIKE $2 OR c.full_name ILIKE $2
               OR EXISTS (SELECT 1 FROM orders ox WHERE ox.customer_id = c.id AND ox.order_number ILIKE $2))`,
      [term, pattern],
    );
    return { customers: result.rows, pagination: { limit, offset, total: Number(count.rows[0]?.total ?? 0) } };
  });

  app.get<{ Params: { customerId: string } }>("/customers/:customerId", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const id = z.string().uuid().safeParse(request.params.customerId);
    if (!id.success) return reply.code(400).send({ error: "INVALID_CUSTOMER_ID" });

    const [customer, orders, addresses, loyalty] = await Promise.all([
      db.query(
        `SELECT id, email, full_name, phone, status, email_verified_at, account_activated_at, created_at, updated_at
           FROM customers WHERE id = $1`, [id.data]),
      db.query(
        `SELECT id, order_number, currency, total_minor, status, payment_status, placed_at
           FROM orders WHERE customer_id = $1 ORDER BY placed_at DESC LIMIT 100`, [id.data]),
      db.query(
        `SELECT id, label, recipient_name, phone, address_line_1, address_line_2, city, region, postal_code, country_code, is_default
           FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC`, [id.data]),
      db.query(
        `SELECT points_balance, lifetime_earned FROM loyalty_accounts WHERE customer_id = $1`, [id.data]),
    ]);
    if (customer.rowCount !== 1) return reply.code(404).send({ error: "CUSTOMER_NOT_FOUND" });
    return { customer: customer.rows[0], orders: orders.rows, addresses: addresses.rows, loyalty: loyalty.rows[0] ?? null };
  });

  app.patch<{ Params: { customerId: string } }>("/customers/:customerId/status", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    if (admin.role !== "owner" && admin.role !== "manager") {
      return reply.code(403).send({ error: "INSUFFICIENT_PERMISSIONS", message: "Only owners and managers can change customer status." });
    }
    const id = z.string().uuid().safeParse(request.params.customerId);
    const parsed = statusSchema.safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_REQUEST", message: "Provide a valid customer ID, status and reason." });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ status: string }>("SELECT status FROM customers WHERE id = $1 FOR UPDATE", [id.data]);
      if (current.rowCount !== 1) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "CUSTOMER_NOT_FOUND" });
      }
      const previousStatus = current.rows[0]!.status;
      await client.query("UPDATE customers SET status = $1, updated_at = now() WHERE id = $2", [parsed.data.status, id.data]);
      if (parsed.data.status === "suspended") {
        await client.query(
          "UPDATE customer_sessions SET revoked_at = now() WHERE customer_id = $1 AND revoked_at IS NULL",
          [id.data],
        );
      }
      await client.query(
        `INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, 'customer.status_changed', 'customer', $2, $3, $4::jsonb)`,
        [admin.id, parsed.data.status === "suspended" ? "Customer suspended" : "Customer reactivated",
         id.data, parsed.data.reason, JSON.stringify({ previousStatus, newStatus: parsed.data.status })],
      );
      await client.query("COMMIT");
      return { status: "updated", customerId: id.data, previousStatus, newStatus: parsed.data.status };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      request.log.error({ err: error }, "Admin customer status update failed");
      return reply.code(500).send({ error: "CUSTOMER_UPDATE_FAILED" });
    } finally {
      client.release();
    }
  });

  app.get("/orders", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const parsed = searchSchema.extend({ status: z.string().trim().max(40).optional() }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_QUERY" });
    const { search = "", status, limit, offset } = parsed.data;
    const pattern = `%${search}%`;
    const result = await db.query(
      `SELECT o.id, o.order_number, o.currency, o.total_minor, o.status, o.payment_status, o.placed_at,
              COALESCE(c.email, o.guest_email) AS customer_email,
              COALESCE(c.full_name, '') AS customer_name
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        WHERE ($1 = '' OR o.order_number ILIKE $2 OR COALESCE(c.email, o.guest_email) ILIKE $2)
          AND ($3::text IS NULL OR o.status::text = $3)
        ORDER BY o.placed_at DESC LIMIT $4 OFFSET $5`,
      [search, pattern, status ?? null, limit, offset],
    );
    const count = await db.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        WHERE ($1 = '' OR o.order_number ILIKE $2 OR COALESCE(c.email, o.guest_email) ILIKE $2)
          AND ($3::text IS NULL OR o.status::text = $3)`,
      [search, pattern, status ?? null],
    );
    return { orders: result.rows, pagination: { limit, offset, total: Number(count.rows[0]?.total ?? 0) } };
  });

  app.get<{ Params: { orderNumber: string } }>("/orders/:orderNumber", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const orderNumber = z.string().trim().min(3).max(64).safeParse(request.params.orderNumber);
    if (!orderNumber.success) return reply.code(400).send({ error: "INVALID_ORDER_NUMBER" });
    const order = await db.query(
      `SELECT o.*, c.email AS customer_email, c.full_name AS customer_name
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.order_number = $1 LIMIT 1`, [orderNumber.data]);
    if (order.rowCount !== 1) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
    const [items, payments] = await Promise.all([
      db.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [order.rows[0]!.id]),
      db.query("SELECT id, provider, amount_minor, currency, status, paid_at, created_at FROM payments WHERE order_id = $1 ORDER BY created_at DESC", [order.rows[0]!.id]),
    ]);
    return { order: order.rows[0], items: items.rows, payments: payments.rows };
  });

  app.get("/audit-logs", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    if (admin.role !== "owner" && admin.role !== "manager") {
      return reply.code(403).send({ error: "INSUFFICIENT_PERMISSIONS" });
    }
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PAGINATION" });
    const result = await db.query(
      `SELECT l.id, l.action, l.entity_type, l.entity_id, l.reason, l.metadata, l.created_at,
              a.email AS admin_email
         FROM admin_audit_logs l LEFT JOIN admin_users a ON a.id = l.admin_user_id
        ORDER BY l.created_at DESC LIMIT $1 OFFSET $2`,
      [parsed.data.limit, parsed.data.offset],
    );
    return { auditLogs: result.rows, pagination: parsed.data };
  });
}
