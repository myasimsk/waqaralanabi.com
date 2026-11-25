import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { db } from "../db/pool.js";

const scryptAsync = promisify(scrypt);

async function main(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const role = process.env.ADMIN_BOOTSTRAP_ROLE ?? "owner";
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set ADMIN_BOOTSTRAP_EMAIL to a valid email address.");
  }
  if (!["owner", "manager", "support", "fulfilment"].includes(role)) {
    throw new Error("ADMIN_BOOTSTRAP_ROLE must be owner, manager, support or fulfilment.");
  }
  if (!password || password.length < 16 || password.length > 128) {
    throw new Error("Set ADMIN_BOOTSTRAP_PASSWORD to a password between 16 and 128 characters.");
  }

  const existing = await db.query("SELECT id FROM admin_users WHERE lower(trim(email)) = $1 LIMIT 1", [email]);
  if (existing.rowCount) throw new Error("An administrator with this email already exists; no changes were made.");

  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64, {
    N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  }) as Buffer;
  const passwordHash = `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;

  await db.query(
    "INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, $3)",
    [email, passwordHash, role],
  );
  process.stdout.write(`Administrator created: ${email} (${role})\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Admin creation failed"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => db.end());
