import test from "node:test";
import assert from "node:assert/strict";

// Use the real Fastify route handlers with a controlled database boundary.
// This verifies HTTP status/role behavior without touching a developer database.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test";
process.env.DATABASE_SSL = "false";
process.env.STOREFRONT_ORIGIN = "http://localhost:5500";
process.env.LOG_LEVEL = "silent";

const [{ default: Fastify }, { default: cookie }, { default: rateLimit }, { scrypt: derive }, { randomBytes }, { adminRoutes }, { orderAdminRoutes }, { db }] =
  await Promise.all([
    import("fastify"),
    import("@fastify/cookie"),
    import("@fastify/rate-limit"),
    import("node:crypto"),
    import("../src/routes/admin.ts"),
    import("../src/routes/checkout.ts"),
    import("../src/db/pool.ts"),
  ]);

const originalQuery = db.query.bind(db);
const originalConnect = db.connect.bind(db);
let activeRole = "support";
let sessionValid = true;
let queryCalls = [];
let loginAccount = null;

db.query = async (sql, params) => {
  const statement = String(sql);
  queryCalls.push(statement);
  if (statement.includes("FROM admin_users WHERE lower(trim(email))")) {
    return { rows: loginAccount ? [loginAccount] : [], rowCount: loginAccount ? 1 : 0 };
  }
  if (statement.includes("FROM admin_sessions s") && statement.includes("JOIN admin_users a")) {
    return sessionValid
      ? { rows: [{ id: "admin-test-id", email: "admin@example.test", role: activeRole }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }
  if (statement.startsWith("UPDATE admin_sessions SET last_seen_at")) {
    return { rows: [], rowCount: 1 };
  }
  if (statement.includes("FROM bank_transfer_proofs p")) {
    return { rows: [], rowCount: 0 };
  }
  if (statement.includes("FROM admin_audit_logs l")) {
    return { rows: [], rowCount: 0 };
  }
  return { rows: [], rowCount: 0 };
};

async function makeApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(orderAdminRoutes, { prefix: "/admin/orders" });
  return app;
}

test("admin HTTP routes enforce authentication and role boundaries", async (t) => {
  const app = await makeApp();
  t.after(async () => {
    await app.close();
    db.query = originalQuery;
    db.connect = originalConnect;
    await db.end();
  });

  const call = (method, url, role, body) => {
    activeRole = role;
    queryCalls = [];
    return app.inject({
      method,
      url,
      ...(body ? { payload: body } : {}),
      headers: { cookie: "wa_admin_session=role-test-token" },
    });
  };

  const unauthenticated = await app.inject({ method: "GET", url: "/admin/audit-logs" });
  assert.equal(unauthenticated.statusCode, 401);

  // Exercise the real login handler, password verification and route-level throttle.
  const salt = randomBytes(16);
  const passwordKey = await new Promise((resolve, reject) => {
    derive("Correct-Horse-Battery-9", salt, 64,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
  loginAccount = {
    id: "admin-login-id",
    email: "admin@example.test",
    password_hash: "scrypt$16384$8$1$" + salt.toString("hex") + "$" + passwordKey.toString("hex"),
    role: "owner",
    is_active: true,
  };
  const successfulLogin = await app.inject({
    method: "POST",
    url: "/admin/login",
    payload: { email: " ADMIN@example.test ", password: "Correct-Horse-Battery-9" },
  });
  assert.equal(successfulLogin.statusCode, 200);
  assert.equal(successfulLogin.json().admin.role, "owner");
  assert.match(successfulLogin.headers["set-cookie"], /wa_admin_session=/);
  assert.equal(successfulLogin.headers["cache-control"], "private, no-store, max-age=0");

  loginAccount = { ...loginAccount, is_active: false };
  const inactiveLogin = await app.inject({
    method: "POST", url: "/admin/login",
    payload: { email: "admin@example.test", password: "Correct-Horse-Battery-9" },
  });
  assert.equal(inactiveLogin.statusCode, 401);
  assert.equal(inactiveLogin.json().error, "INVALID_CREDENTIALS");

  loginAccount = { ...loginAccount, is_active: true };
  const wrongPassword = await app.inject({
    method: "POST", url: "/admin/login",
    payload: { email: "admin@example.test", password: "incorrect-password" },
  });
  assert.equal(wrongPassword.statusCode, 401);
  assert.equal(wrongPassword.json().error, "INVALID_CREDENTIALS");

  for (let attempt = 0; attempt < 2; attempt++) {
    const failed = await app.inject({
      method: "POST", url: "/admin/login",
      payload: { email: "missing@example.test", password: "incorrect-password" },
    });
    assert.equal(failed.statusCode, 401);
  }
  const throttledLogin = await app.inject({
    method: "POST", url: "/admin/login",
    payload: { email: "missing@example.test", password: "incorrect-password" },
  });
  assert.equal(throttledLogin.statusCode, 429);

  sessionValid = false;
  const expired = await app.inject({
    method: "GET",
    url: "/admin/me",
    headers: { cookie: "wa_admin_session=expired-session-token" },
  });
  assert.equal(expired.statusCode, 401);
  assert.match(expired.headers["set-cookie"], /wa_admin_session=;/);
  sessionValid = true;

  const logout = await app.inject({
    method: "POST",
    url: "/admin/logout",
    headers: { cookie: "wa_admin_session=role-test-token" },
  });
  assert.equal(logout.statusCode, 200);
  assert.equal(logout.json().status, "signed_out");
  assert.equal(queryCalls.some((sql) => sql.includes("UPDATE admin_sessions SET revoked_at")), true);

  const supportAudit = await call("GET", "/admin/audit-logs", "support");
  assert.equal(supportAudit.statusCode, 403);
  assert.equal(queryCalls.some((sql) => sql.includes("FROM admin_audit_logs l")), false);

  const fulfilmentAudit = await call("GET", "/admin/audit-logs", "fulfilment");
  assert.equal(fulfilmentAudit.statusCode, 403);

  const managerAudit = await call("GET", "/admin/audit-logs", "manager");
  assert.equal(managerAudit.statusCode, 200);

  const fulfilmentReceipt = await call("GET", "/admin/orders/WA-TEST-1001/bank-transfer-proof", "fulfilment");
  assert.equal(fulfilmentReceipt.statusCode, 403);
  assert.equal(queryCalls.some((sql) => sql.includes("FROM bank_transfer_proofs p")), false);

  const supportReceipt = await call("GET", "/admin/orders/WA-TEST-1001/bank-transfer-proof", "support");
  assert.equal(supportReceipt.statusCode, 404);
  assert.equal(queryCalls.some((sql) => sql.includes("FROM bank_transfer_proofs p")), true);

  const supportReview = await call("PATCH", "/admin/orders/WA-TEST-1001/bank-transfer-review", "support", {
    decision: "approve",
    reason: "Verified bank transfer",
  });
  assert.equal(supportReview.statusCode, 403);
  assert.equal(queryCalls.some((sql) => sql.includes("FROM orders WHERE order_number")), false);

  const fulfilmentReview = await call("PATCH", "/admin/orders/WA-TEST-1001/bank-transfer-review", "fulfilment", {
    decision: "approve",
    reason: "Verified bank transfer",
  });
  assert.equal(fulfilmentReview.statusCode, 403);

  db.connect = async () => ({
    query: async (sql) => String(sql).startsWith("SELECT id,status,payment_status,payment_method")
      ? { rows: [], rowCount: 0 }
      : { rows: [], rowCount: 0 },
    release() {},
  });

  const fulfilmentStatus = await call("PATCH", "/admin/orders/WA-TEST-1001/status", "fulfilment", {
    status: "processing",
    reason: "Prepared for dispatch",
  });
  // The permission gate allows fulfilment; the mocked database has no order row.
  assert.equal(fulfilmentStatus.statusCode, 404);

  const supportStatus = await call("PATCH", "/admin/orders/WA-TEST-1001/status", "support", {
    status: "processing",
    reason: "Prepared for dispatch",
  });
  assert.equal(supportStatus.statusCode, 403);
});
