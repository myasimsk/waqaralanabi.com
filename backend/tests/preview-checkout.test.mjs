import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

test("preview checkout advertises test mode and rejects real contact and payment details", async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
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
  } finally {
    await app.close();
    await db.end();
  }
});
