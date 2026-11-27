import test from "node:test";
import assert from "node:assert/strict";

// Use the real Fastify route handlers with a controlled database boundary.
// This verifies HTTP status/role behavior without touching a developer database.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test";
process.env.DATABASE_SSL = "false";
process.env.STOREFRONT_ORIGIN = "http://localhost:5500";
process.env.LOG_LEVEL = "silent";

const [{ default: Fastify }, { default: cookie }, { adminRoutes }, { orderAdminRoutes }, { db }] =
  await Promise.all([
    import("fastify"),
    import("@fastify/cookie"),
    import("../src/routes/admin.ts"),
    import("../src/routes/checkout.ts"),
    import("../src/db/pool.ts"),
  ]);

const originalQuery = db.query.bind(db);
let activeRole = "support";
let queryCalls = [];

db.query = async (sql, params) => {
  const statement = String(sql);
  queryCalls.push(statement);
  if (statement.includes("FROM admin_sessions s") && statement.includes("JOIN admin_users a")) {
    return { rows: [{ id: "admin-test-id", email: "admin@example.test", role: activeRole }], rowCount: 1 };
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
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(orderAdminRoutes, { prefix: "/admin/orders" });
  return app;
}

test("admin HTTP routes enforce authentication and role boundaries", async (t) => {
  const app = await makeApp();
  t.after(async () => {
    await app.close();
    db.query = originalQuery;
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
