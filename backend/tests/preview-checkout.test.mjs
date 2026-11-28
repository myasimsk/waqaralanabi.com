import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

test("preview checkout advertises test mode and rejects real contact and payment details", async () => {
  const sharedDatabase = process.env.TEST_DATABASE_URL;
  const schema = "wa_preview_" + randomUUID().replaceAll("-", "");
  const setup = sharedDatabase ? new pg.Pool({ connectionString: sharedDatabase }) : null;
  const database = new URL(sharedDatabase ?? "postgresql://test:test@localhost:5432/test");
  if (setup) {
    await setup.query('CREATE SCHEMA "' + schema + '"');
    database.searchParams.set("options", "-c search_path=" + schema + ",public");
  }
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: database.toString(),
    DATABASE_SSL: "false",
    PREVIEW_CHECKOUT_ENABLED: "true",
    COMMERCE_LAUNCH_READY: "false",
    STOREFRONT_ORIGIN: "https://waqar-al-anabi-preview.pages.dev",
    LOG_LEVEL: "silent",
  });
  const { buildApp } = await import("../src/app.ts");
  const { db } = await import("../src/db/pool.ts");
  const app = await buildApp();
  try {
    const config = await app.inject("/checkout/config");
    assert.deepEqual(config.json(), { previewOrdersEnabled: true });

    const fixture = {
      email: "preview@example.test",
      fullName: "Test Customer",
      phone: "03000000000",
      addressLine1: "123 Test Street",
      city: "Test City",
      countryCode: "PK",
      paymentMethod: "cod",
      idempotencyKey: randomUUID(),
      items: [{ variantId: randomUUID(), quantity: 1 }],
    };
    for (const override of [
      { email: "preview@example.com" },
      { paymentMethod: "card" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/checkout/orders",
        payload: { ...fixture, ...override },
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error, "PREVIEW_CHECKOUT_ONLY");
    }

    const proof = await app.inject({
      method: "POST",
      url: "/checkout/orders/WAT-TEST/bank-transfer-proof",
      payload: {},
    });
    assert.equal(proof.statusCode, 503);
    assert.equal(proof.json().error, "PREVIEW_PAYMENT_DISABLED");

    if (setup) {
      const { initializePreviewAdmin, initializePreviewDatabase } = await import("../src/db/initialize-preview.ts");
      await initializePreviewDatabase();
      await initializePreviewDatabase();
      const catalogue = await app.inject("/catalog");
      assert.equal(catalogue.statusCode, 200);
      assert.equal(catalogue.json().products.length, 7);
      assert.equal(catalogue.json().products.flatMap((product) => product.variants).length, 104);

      const variant = catalogue.json().products[0].variants[0];
      const payload = { ...fixture, items: [{ variantId: variant.id, quantity: 1 }] };
      const order = await app.inject({ method: "POST", url: "/checkout/orders", payload });
      assert.equal(order.statusCode, 201);
      assert.equal(order.json().testOnly, true);
      assert.match(order.json().order.orderNumber, /^WAT-/);
      const retry = await app.inject({ method: "POST", url: "/checkout/orders", payload });
      assert.equal(retry.statusCode, 200);
      assert.equal(retry.json().order.orderNumber, order.json().order.orderNumber);

      const stock = await db.query("SELECT reserved_quantity FROM product_variants WHERE id=$1", [variant.id]);
      assert.equal(stock.rows[0].reserved_quantity, 1);

      const customerPassword = randomUUID();
      const registration = {
        email: fixture.email, fullName: fixture.fullName, password: customerPassword,
        orderNumber: order.json().order.orderNumber, accessToken: order.json().accessToken,
      };
      const register = (payload) => app.inject({ method: "POST", url: "/auth/register/preview", payload });
      assert.equal((await register({ ...registration, accessToken: "0".repeat(64) })).statusCode, 400);
      assert.equal((await register(registration)).statusCode, 201);
      assert.equal((await register(registration)).statusCode, 400);
      const customer = await app.inject({
        method: "POST", url: "/auth/login", payload: { email: fixture.email, password: customerPassword },
      });
      assert.equal(customer.statusCode, 200);
      const customerCookie = customer.cookies.find((cookie) => cookie.name === "wa_customer_session");
      assert.ok(customerCookie?.httpOnly);
      const customerCookies = { [customerCookie.name]: customerCookie.value };
      const history = await app.inject({ url: "/account/orders", cookies: customerCookies });
      assert.equal(history.statusCode, 200);
      assert.equal(history.json().orders[0].order_number, registration.orderNumber);

      const adminPassword = randomUUID();
      process.env.PREVIEW_ADMIN_PASSWORD = adminPassword;
      await initializePreviewAdmin();
      await initializePreviewAdmin();
      delete process.env.PREVIEW_ADMIN_PASSWORD;
      const signIn = await app.inject({
        method: "POST", url: "/admin/login", payload: { email: "admin@example.test", password: adminPassword },
      });
      assert.equal(signIn.statusCode, 200);
      const adminCookie = signIn.cookies.find((cookie) => cookie.name === "wa_admin_session");
      assert.ok(adminCookie?.httpOnly);
      const adminCookies = { [adminCookie.name]: adminCookie.value };
      const update = (status) => app.inject({
        method: "PATCH", url: "/admin/orders/" + registration.orderNumber + "/status", cookies: adminCookies,
        payload: { status, reason: "Synthetic integration test" },
      });
      for (const state of ["processing", "shipped", "delivered"]) assert.equal((await update(state)).statusCode, 200);
      assert.equal((await update("delivered")).statusCode, 409);

      const loyalty = await app.inject({ url: "/account/loyalty", cookies: customerCookies });
      assert.equal(loyalty.statusCode, 200);
      assert.equal(Number(loyalty.json().loyalty.balance), Math.floor(Number(order.json().order.totalMinor) / 10_000));
      const payment = await db.query("SELECT payment_status FROM orders WHERE order_number=$1", [registration.orderNumber]);
      assert.equal(payment.rows[0].payment_status, "paid");

      const bankOrder = await app.inject({
        method: "POST", url: "/checkout/orders", payload: { ...payload, paymentMethod: "bank_transfer", idempotencyKey: randomUUID() },
      });
      assert.equal(bankOrder.statusCode, 201);
      assert.equal(bankOrder.json().payment.bankInstructionsAvailable, false);
      assert.equal(bankOrder.json().payment.bankTransfer, undefined);
      const bankNumber = bankOrder.json().order.orderNumber;
      const approve = await app.inject({
        method: "PATCH", url: "/admin/orders/" + bankNumber + "/bank-transfer-review", cookies: adminCookies,
        payload: { decision: "approve", reason: "Synthetic transfer review" },
      });
      assert.equal(approve.statusCode, 200);
    }
  } finally {
    await app.close();
    await db.end();
    if (setup) {
      await setup.query('DROP SCHEMA "' + schema + '" CASCADE');
      await setup.end();
    }
  }
});
