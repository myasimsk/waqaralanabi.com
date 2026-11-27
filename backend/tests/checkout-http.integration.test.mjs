import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const baseDatabaseUrl = process.env.TEST_DATABASE_URL;

test("real checkout HTTP routes reserve stock, enforce idempotency, accept bank proofs and approve payment", {
  skip: !baseDatabaseUrl,
}, async () => {
  const setupPool = new Pool({ connectionString: baseDatabaseUrl, max: 2 });
  const schema = "wa_checkout_http_" + randomUUID().replaceAll("-", "");
  let app;
  let db;

  try {
    await setupPool.query('CREATE SCHEMA "' + schema + '"');

    const migrationClient = await setupPool.connect();
    try {
      await migrationClient.query('SET search_path TO "' + schema + '", public');
      const schemaSql = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
      await migrationClient.query(schemaSql);

      const migrations = [
        "002_customer_sessions.sql",
        "003_admin_sessions.sql",
        "004_catalog_inventory.sql",
        "005_product_image_gallery.sql",
        "006_newsletter_subscribers.sql",
        "007_checkout_orders.sql",
        "008_checkout_payment_hardening.sql",
        "009_one_payment_per_order.sql",
      ];
      for (const migration of migrations) {
        const sql = await readFile(new URL("../database/migrations/" + migration, import.meta.url), "utf8");
        await migrationClient.query(sql);
      }
    } finally {
      migrationClient.release();
    }

    const scopedUrl = new URL(baseDatabaseUrl);
    scopedUrl.searchParams.set("options", "-c search_path=" + schema + ",public");

    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = scopedUrl.toString();
    process.env.DATABASE_SSL = "false";
    process.env.COMMERCE_LAUNCH_READY = "true";
    process.env.STOREFRONT_ORIGIN = "http://localhost:5500";
    process.env.LOG_LEVEL = "silent";
    process.env.BANK_TRANSFER_ACCOUNT_TITLE = "INTEGRATION TEST ONLY";
    process.env.BANK_TRANSFER_BANK_NAME = "Integration Test Bank";
    process.env.BANK_TRANSFER_IBAN = "PK00TEST0000000000000000";
    process.env.BANK_TRANSFER_ACCOUNT_NUMBER = "TEST-ACCOUNT-NOT-REAL";
    process.env.BANK_TRANSFER_BRANCH = "TEST BRANCH";
    process.env.BANK_TRANSFER_CITY = "TEST CITY";

    const appModule = await import("../src/app.ts");
    const dbModule = await import("../src/db/pool.ts");
    db = dbModule.db;
    app = await appModule.buildApp();
    await app.ready();

    const product = await db.query(
      "INSERT INTO catalog_products(name,slug,description,category,price_minor,currency,is_active) " +
      "VALUES('HTTP Integration Polo','http-integration-polo','Test-only product','Men',250000,'PKR',true) RETURNING id",
    );
    const productId = product.rows[0].id;

    const codVariant = await db.query(
      "INSERT INTO product_variants(product_id,sku,colour,size,stock_on_hand,reserved_quantity,is_active) " +
      "VALUES($1,'HTTP-TEST-COD-BLK-M','Black','M',1,0,true) RETURNING id",
      [productId],
    );
    const bankVariant = await db.query(
      "INSERT INTO product_variants(product_id,sku,colour,size,stock_on_hand,reserved_quantity,is_active) " +
      "VALUES($1,'HTTP-TEST-BANK-WHT-M','White','M',2,0,true) RETURNING id",
      [productId],
    );

    const checkoutBody = (variantId, paymentMethod, idempotencyKey, quantity = 1) => ({
      email: "checkout.integration@example.test",
      fullName: "Checkout Integration Test",
      phone: "03000000000",
      addressLine1: "123 Integration Test Street",
      addressLine2: "",
      city: "Test City",
      region: "Test Region",
      postalCode: "00000",
      countryCode: "PK",
      paymentMethod,
      idempotencyKey,
      items: [{ variantId, quantity }],
    });

    const codKey = randomUUID();
    const codBody = checkoutBody(codVariant.rows[0].id, "cod", codKey);
    const codResponse = await app.inject({
      method: "POST",
      url: "/checkout/orders",
      payload: codBody,
    });
    assert.equal(codResponse.statusCode, 201, codResponse.body);
    const codOrder = codResponse.json();
    assert.equal(codOrder.order.status, "confirmed");
    assert.equal(codOrder.order.paymentStatus, "pending");

    const codRetry = await app.inject({
      method: "POST",
      url: "/checkout/orders",
      payload: codBody,
    });
    assert.equal(codRetry.statusCode, 200, codRetry.body);
    assert.equal(codRetry.json().reused, true);
    assert.equal(codRetry.json().order.orderNumber, codOrder.order.orderNumber);

    const changedRetry = await app.inject({
      method: "POST",
      url: "/checkout/orders",
      payload: checkoutBody(codVariant.rows[0].id, "cod", codKey, 2),
    });
    assert.equal(changedRetry.statusCode, 409);
    assert.equal(changedRetry.json().error, "IDEMPOTENCY_KEY_REUSED");

    const oversell = await app.inject({
      method: "POST",
      url: "/checkout/orders",
      payload: checkoutBody(codVariant.rows[0].id, "cod", randomUUID(), 1),
    });
    assert.equal(oversell.statusCode, 409);
    assert.equal(oversell.json().error, "INSUFFICIENT_STOCK");

    const codInventory = await db.query(
      "SELECT stock_on_hand,reserved_quantity FROM product_variants WHERE id=$1",
      [codVariant.rows[0].id],
    );
    assert.deepEqual(codInventory.rows[0], { stock_on_hand: 1, reserved_quantity: 1 });

    const bankKey = randomUUID();
    const bankResponse = await app.inject({
      method: "POST",
      url: "/checkout/orders",
      payload: checkoutBody(bankVariant.rows[0].id, "bank_transfer", bankKey),
    });
    assert.equal(bankResponse.statusCode, 201, bankResponse.body);
    const bankOrder = bankResponse.json();
    assert.equal(bankOrder.order.status, "pending_payment");
    assert.equal(bankOrder.payment.bankInstructionsAvailable, true);

    const proofBytes = Buffer.from("%PDF-1.4\nIntegration test receipt\n%%EOF", "ascii");
    const proofBody = {
      fileName: "integration-receipt.pdf",
      mimeType: "application/pdf",
      dataBase64: proofBytes.toString("base64"),
      accessToken: bankOrder.accessToken,
    };
    const proofUrl = "/checkout/orders/" + bankOrder.order.orderNumber + "/bank-transfer-proof";

    const invalidToken = await app.inject({
      method: "POST",
      url: proofUrl,
      payload: { ...proofBody, accessToken: "x".repeat(64) },
    });
    assert.equal(invalidToken.statusCode, 404);

    const proofResponse = await app.inject({
      method: "POST",
      url: proofUrl,
      payload: proofBody,
    });
    assert.equal(proofResponse.statusCode, 201, proofResponse.body);

    const duplicateProof = await app.inject({
      method: "POST",
      url: proofUrl,
      payload: proofBody,
    });
    assert.equal(duplicateProof.statusCode, 409);
    assert.equal(duplicateProof.json().error, "PROOF_ALREADY_RECEIVED");

    const unauthorizedReview = await app.inject({
      method: "PATCH",
      url: "/admin/orders/" + bankOrder.order.orderNumber + "/bank-transfer-review",
      payload: { decision: "approve", reason: "Integration test approval" },
    });
    assert.equal(unauthorizedReview.statusCode, 401);

    const salt = randomBytes(16);
    const password = "Integration-Test-Owner-Password-2026";
    const passwordKey = scryptSync(password, salt, 64, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    const passwordHash = [
      "scrypt",
      "16384",
      "8",
      "1",
      salt.toString("hex"),
      passwordKey.toString("hex"),
    ].join("$");

    await db.query(
      "INSERT INTO admin_users(email,password_hash,role,is_active) VALUES($1,$2,'owner',true)",
      ["integration-owner@example.test", passwordHash],
    );

    const login = await app.inject({
      method: "POST",
      url: "/admin/login",
      payload: { email: "integration-owner@example.test", password },
    });
    assert.equal(login.statusCode, 200, login.body);
    const setCookie = login.headers["set-cookie"];
    const cookieHeader = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];

    const review = await app.inject({
      method: "PATCH",
      url: "/admin/orders/" + bankOrder.order.orderNumber + "/bank-transfer-review",
      headers: { cookie: cookieHeader },
      payload: { decision: "approve", reason: "Integration test payment verified" },
    });
    assert.equal(review.statusCode, 200, review.body);
    assert.equal(review.json().status, "approved");

    const bankState = await db.query(
      "SELECT o.status,o.payment_status,p.status AS payment_state,b.review_status AS proof_state,v.stock_on_hand,v.reserved_quantity " +
      "FROM orders o JOIN payments p ON p.order_id=o.id " +
      "JOIN bank_transfer_proofs b ON b.order_id=o.id " +
      "JOIN order_items i ON i.order_id=o.id " +
      "JOIN product_variants v ON v.id=i.variant_id WHERE o.order_number=$1",
      [bankOrder.order.orderNumber],
    );
    assert.equal(bankState.rowCount, 1);
    assert.deepEqual(bankState.rows[0], {
      status: "confirmed",
      payment_status: "paid",
      payment_state: "paid",
      proof_state: "approved",
      stock_on_hand: 1,
      reserved_quantity: 0,
    });

    const audit = await db.query(
      "SELECT count(*)::int AS count FROM admin_audit_logs WHERE action='order.bank_transfer_approve'",
    );
    assert.equal(audit.rows[0].count, 1);
  } finally {
    if (app) await app.close().catch(() => undefined);
    if (db) await db.end().catch(() => undefined);
    await setupPool.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE').catch(() => undefined);
    await setupPool.end();
  }
});
