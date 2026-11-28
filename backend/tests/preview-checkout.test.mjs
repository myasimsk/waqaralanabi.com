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
      { paymentMethod: "bank_transfer" },
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
      const { initializePreviewDatabase } = await import("../src/db/initialize-preview.ts");
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
