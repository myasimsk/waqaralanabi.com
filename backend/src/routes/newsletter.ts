import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/pool.js";
import { requireAdmin } from "./admin.js";

const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  consent: z.literal(true),
  website: z.string().max(0).optional().default(""),
});

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  search: z.string().trim().max(254).optional(),
});

export async function newsletterRoutes(app: FastifyInstance): Promise<void> {
  app.post("/newsletter", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "INVALID_NEWSLETTER_SIGNUP",
        message: "Enter a valid email address and confirm your consent to receive updates.",
      });
    }
    const email = parsed.data.email.toLowerCase();
    await db.query(
      `INSERT INTO newsletter_subscribers (email, email_normalized, consented_at, status, updated_at)
       VALUES ($1, $2, now(), 'active', now())
       ON CONFLICT (email_normalized) DO UPDATE
         SET email = EXCLUDED.email,
             consented_at = now(),
             status = 'active',
             updated_at = now()`,
      [parsed.data.email, email],
    );
    return reply.code(201).send({
      status: "recorded",
      message: "Thank you. Your email has been added to WA updates.",
    });
  });

  app.get("/admin/newsletter", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    if (admin.role !== "owner" && admin.role !== "manager" && admin.role !== "support") {
      return reply.code(403).send({ error: "INSUFFICIENT_PERMISSIONS" });
    }
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PAGINATION" });
    const { limit, offset, search } = parsed.data;
    const values: unknown[] = [];
    let where = "WHERE status = 'active'";
    if (search) {
      values.push("%" + search.toLowerCase() + "%");
      where += " AND email_normalized LIKE $" + values.length;
    }
    const count = await db.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM newsletter_subscribers ${where}`,
      values,
    );
    values.push(limit, offset);
    const rows = await db.query(
      `SELECT id, email, consented_at, created_at
         FROM newsletter_subscribers ${where}
        ORDER BY created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { subscribers: rows.rows, pagination: { total: Number(count.rows[0]?.total || 0), limit, offset } };
  });
}
