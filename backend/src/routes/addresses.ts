import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../db/pool.js";

const SESSION_COOKIE = "wa_customer_session";

async function customerIdFor(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) {
    reply.code(401).send({ error: "AUTHENTICATION_REQUIRED", message: "Please sign in to manage addresses." });
    return null;
  }
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const result = await db.query<{ customer_id: string }>(
    `SELECT s.customer_id FROM customer_sessions s
       JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL
        AND s.expires_at > now() AND c.status = 'active' LIMIT 1`,
    [tokenHash],
  );
  if (result.rowCount !== 1) {
    reply.code(401).send({ error: "AUTHENTICATION_REQUIRED", message: "Your session has expired. Please sign in again." });
    return null;
  }
  await db.query("UPDATE customer_sessions SET last_seen_at = now() WHERE token_hash = $1", [tokenHash]);
  return result.rows[0]!.customer_id;
}

const addressFields = {
  label: z.string().trim().max(40).nullable().optional(),
  recipientName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).nullable().optional(),
  addressLine1: z.string().trim().min(3).max(180),
  addressLine2: z.string().trim().max(180).nullable().optional(),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().max(100).nullable().optional(),
  postalCode: z.string().trim().max(24).nullable().optional(),
  countryCode: z.string().trim().length(2).transform((v) => v.toUpperCase()),
};

const createAddressSchema = z.object({
  ...addressFields,
  isDefault: z.boolean().optional(),
});
const updateAddressSchema = z.object({
  label: addressFields.label,
  recipientName: addressFields.recipientName.optional(),
  phone: addressFields.phone,
  addressLine1: addressFields.addressLine1.optional(),
  addressLine2: addressFields.addressLine2,
  city: addressFields.city.optional(),
  region: addressFields.region,
  postalCode: addressFields.postalCode,
  countryCode: addressFields.countryCode.optional(),
}).refine((value) => Object.values(value).some((v) => v !== undefined), {
  message: "Provide at least one address field to update.",
});

function toColumns(input: z.infer<typeof createAddressSchema>) {
  return [
    input.label ?? null, input.recipientName, input.phone ?? null,
    input.addressLine1, input.addressLine2 ?? null, input.city,
    input.region ?? null, input.postalCode ?? null, input.countryCode,
  ];
}

export async function addressRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const customerId = await customerIdFor(request, reply);
    if (!customerId) return;
    const result = await db.query(
      `SELECT id, label, recipient_name, phone, address_line_1,
              address_line_2, city, region, postal_code, country_code,
              is_default, created_at
         FROM customer_addresses
        WHERE customer_id = $1
        ORDER BY is_default DESC, created_at DESC`,
      [customerId],
    );
    return { addresses: result.rows };
  });

  app.post("/", async (request, reply) => {
    const customerId = await customerIdFor(request, reply);
    if (!customerId) return;
    const parsed = createAddressSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_ADDRESS", message: "Check the required delivery address fields." });
    }
    const input = parsed.data;
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM customer_addresses WHERE customer_id = $1",
        [customerId],
      );
      const makeDefault = input.isDefault === true || Number(existing.rows[0]?.count ?? 0) === 0;
      if (makeDefault) {
        await client.query("UPDATE customer_addresses SET is_default = false WHERE customer_id = $1", [customerId]);
      }
      const inserted = await client.query(
        `INSERT INTO customer_addresses
          (customer_id, label, recipient_name, phone, address_line_1,
           address_line_2, city, region, postal_code, country_code, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, label, recipient_name, phone, address_line_1,
                   address_line_2, city, region, postal_code, country_code,
                   is_default, created_at`,
        [customerId, ...toColumns(input), makeDefault],
      );
      await client.query("COMMIT");
      return reply.code(201).send({ address: inserted.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      request.log.error({ err: error }, "Address creation failed");
      return reply.code(500).send({ error: "ADDRESS_CREATE_FAILED", message: "We could not save this address." });
    } finally {
      client.release();
    }
  });

  app.patch("/:addressId", async (request, reply) => {
    const customerId = await customerIdFor(request, reply);
    if (!customerId) return;
    const id = z.string().uuid().safeParse((request.params as { addressId?: string }).addressId);
    const parsed = updateAddressSchema.safeParse(request.body);
    if (!id.success || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_ADDRESS", message: "Check the address details." });
    }
    const fields: Array<[string, unknown]> = [
      ["label", parsed.data.label],
      ["recipient_name", parsed.data.recipientName],
      ["phone", parsed.data.phone],
      ["address_line_1", parsed.data.addressLine1],
      ["address_line_2", parsed.data.addressLine2],
      ["city", parsed.data.city],
      ["region", parsed.data.region],
      ["postal_code", parsed.data.postalCode],
      ["country_code", parsed.data.countryCode],
    ];
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of fields) {
      if (value !== undefined) {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
    }
    values.push(id.data, customerId);
    const result = await db.query(
      `UPDATE customer_addresses SET ${sets.join(", ")}
        WHERE id = $${values.length - 1} AND customer_id = $${values.length}
        RETURNING id, label, recipient_name, phone, address_line_1,
                  address_line_2, city, region, postal_code, country_code,
                  is_default, created_at`,
      values,
    );
    if (result.rowCount !== 1) {
      return reply.code(404).send({ error: "ADDRESS_NOT_FOUND", message: "That address was not found in your account." });
    }
    return { address: result.rows[0] };
  });

  app.delete("/:addressId", async (request, reply) => {
    const customerId = await customerIdFor(request, reply);
    if (!customerId) return;
    const id = z.string().uuid().safeParse((request.params as { addressId?: string }).addressId);
    if (!id.success) return reply.code(400).send({ error: "INVALID_ADDRESS_ID" });
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const removed = await client.query<{ was_default: boolean }>(
        `DELETE FROM customer_addresses
          WHERE id = $1 AND customer_id = $2
          RETURNING is_default AS was_default`,
        [id.data, customerId],
      );
      if (removed.rowCount !== 1) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "ADDRESS_NOT_FOUND", message: "That address was not found in your account." });
      }
      if (removed.rows[0]!.was_default) {
        await client.query(
          `UPDATE customer_addresses SET is_default = true
            WHERE id = (
              SELECT id FROM customer_addresses
               WHERE customer_id = $1
               ORDER BY created_at DESC LIMIT 1
            )`,
          [customerId],
        );
      }
      await client.query("COMMIT");
      return { status: "deleted" };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      request.log.error({ err: error }, "Address deletion failed");
      return reply.code(500).send({ error: "ADDRESS_DELETE_FAILED", message: "We could not delete this address." });
    } finally {
      client.release();
    }
  });

  app.post("/:addressId/default", async (request, reply) => {
    const customerId = await customerIdFor(request, reply);
    if (!customerId) return;
    const id = z.string().uuid().safeParse((request.params as { addressId?: string }).addressId);
    if (!id.success) return reply.code(400).send({ error: "INVALID_ADDRESS_ID" });
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query(
        "SELECT id FROM customer_addresses WHERE id = $1 AND customer_id = $2 FOR UPDATE",
        [id.data, customerId],
      );
      if (owned.rowCount !== 1) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "ADDRESS_NOT_FOUND" });
      }
      await client.query("UPDATE customer_addresses SET is_default = false WHERE customer_id = $1", [customerId]);
      await client.query("UPDATE customer_addresses SET is_default = true WHERE id = $1 AND customer_id = $2", [id.data, customerId]);
      await client.query("COMMIT");
      return { status: "default_updated" };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      request.log.error({ err: error }, "Default address update failed");
      return reply.code(500).send({ error: "ADDRESS_UPDATE_FAILED", message: "We could not update your default address." });
    } finally {
      client.release();
    }
  });
}
