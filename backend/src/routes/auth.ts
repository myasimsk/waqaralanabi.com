import { createHash, randomInt, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/pool.js";

const requestCodeSchema = z.object({
  orderNumber: z.string().trim().min(3).max(64),
  email: z.string().trim().email().max(254),
});

const completeRegistrationSchema = requestCodeSchema.extend({
  code: z.string().regex(/^\d{6}$/),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(128),
});

const genericRequestMessage =
  "If the order details are eligible, a verification code will be sent to the email used for that order.";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/register/request-code",
    { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const parsed = requestCodeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "INVALID_REQUEST",
          message: "Enter a valid order number and email address.",
        });
      }

      const email = normalizeEmail(parsed.data.email);
      const { orderNumber } = parsed.data;

      const eligibleOrder = await db.query(
        `SELECT o.id
           FROM orders o
          WHERE o.order_number = $1
            AND lower(trim(o.guest_email)) = $2
            AND o.customer_id IS NULL
          LIMIT 1`,
        [orderNumber, email],
      );

      const existingCustomer = await db.query(
        "SELECT id FROM customers WHERE email_normalized = $1 LIMIT 1",
        [email],
      );

      // Do not reveal whether an order number or customer email exists.
      if (eligibleOrder.rowCount !== 1 || existingCustomer.rowCount !== 0) {
        return reply.code(202).send({ message: genericRequestMessage });
      }

      // Email delivery is deliberately development-only until a provider is configured.
      if (process.env.NODE_ENV !== "development") {
        request.log.error("Account verification email provider is not configured.");
        return reply.code(503).send({
          error: "EMAIL_DELIVERY_UNAVAILABLE",
          message: "Account registration is temporarily unavailable. Please try again later.",
        });
      }

      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const tokenHash = hashCode(code);

      await db.query(
        `UPDATE email_verifications
            SET consumed_at = now()
          WHERE email_normalized = $1
            AND purpose = 'account_activation'
            AND consumed_at IS NULL`,
        [email],
      );

      await db.query(
        `INSERT INTO email_verifications
           (email_normalized, purpose, token_hash, expires_at)
         VALUES ($1, 'account_activation', $2, now() + interval '10 minutes')`,
        [email, tokenHash],
      );

      request.log.info(
        { email, orderNumber, verificationCode: code },
        "Development-only account verification code (never enable this in production)",
      );

      return reply.code(202).send({ message: genericRequestMessage });
    },
  );

  app.post(
    "/register/complete",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const parsed = completeRegistrationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "INVALID_REQUEST",
          message: "Check your details. Passwords must contain at least 12 characters.",
        });
      }

      const email = normalizeEmail(parsed.data.email);
      const suppliedCodeHash = hashCode(parsed.data.code);
      const client = await db.connect();

      try {
        await client.query("BEGIN");

        const verification = await client.query<{
          id: string;
          token_hash: string;
          attempts: number;
        }>(
          `SELECT id, token_hash, attempts
             FROM email_verifications
            WHERE email_normalized = $1
              AND purpose = 'account_activation'
              AND consumed_at IS NULL
              AND expires_at > now()
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE`,
          [email],
        );

        if (verification.rowCount !== 1) {
          await client.query("ROLLBACK");
          return reply.code(400).send({
            error: "VERIFICATION_FAILED",
            message: "The verification code is invalid or expired. Request a new code.",
          });
        }

        const record = verification.rows[0]!;
        const storedHash = Buffer.from(record.token_hash, "hex");
        const submittedHash = Buffer.from(suppliedCodeHash, "hex");
        const codeMatches =
          storedHash.length === submittedHash.length &&
          timingSafeEqual(storedHash, submittedHash);

        if (!codeMatches) {
          await client.query(
            `UPDATE email_verifications
                SET attempts = attempts + 1,
                    consumed_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE consumed_at END
              WHERE id = $1`,
            [record.id],
          );
          await client.query("COMMIT");
          return reply.code(400).send({
            error: "VERIFICATION_FAILED",
            message: "The verification code is invalid or expired. Request a new code.",
          });
        }

        const order = await client.query(
          `SELECT id
             FROM orders
            WHERE order_number = $1
              AND lower(trim(guest_email)) = $2
              AND customer_id IS NULL
            LIMIT 1
            FOR UPDATE`,
          [parsed.data.orderNumber, email],
        );

        if (order.rowCount !== 1) {
          await client.query("ROLLBACK");
          return reply.code(400).send({
            error: "REGISTRATION_NOT_ELIGIBLE",
            message: "We could not verify an eligible order for these details.",
          });
        }

        const existingCustomer = await client.query(
          "SELECT id FROM customers WHERE email_normalized = $1 LIMIT 1",
          [email],
        );

        if (existingCustomer.rowCount !== 0) {
          await client.query("ROLLBACK");
          return reply.code(409).send({
            error: "ACCOUNT_EXISTS",
            message: "An account already exists for this email address. Please sign in.",
          });
        }

        const passwordHash = await hashPassword(parsed.data.password);
        const customer = await client.query<{ id: string }>(
          `INSERT INTO customers
             (email, full_name, password_hash, status, email_verified_at, account_activated_at)
           VALUES ($1, $2, $3, 'active', now(), now())
           RETURNING id`,
          [email, parsed.data.fullName, passwordHash],
        );

        const customerId = customer.rows[0]!.id;
        const linkedOrders = await client.query(
          `UPDATE orders
              SET customer_id = $1, updated_at = now()
            WHERE lower(trim(guest_email)) = $2
              AND customer_id IS NULL`,
          [customerId, email],
        );

        await client.query(
          "INSERT INTO loyalty_accounts (customer_id) VALUES ($1)",
          [customerId],
        );

        await client.query(
          "UPDATE email_verifications SET consumed_at = now() WHERE id = $1",
          [record.id],
        );

        await client.query("COMMIT");

        return reply.code(201).send({
          status: "account_activated",
          customer: { id: customerId, email, fullName: parsed.data.fullName },
          linkedOrderCount: linkedOrders.rowCount ?? 0,
          message: "Your account has been created and your eligible order history has been linked.",
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        request.log.error({ err: error }, "Customer registration failed");
        return reply.code(500).send({
          error: "REGISTRATION_FAILED",
          message: "We could not complete registration. Please try again.",
        });
      } finally {
        client.release();
      }
    },
  );
}
