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
    LOG_LEVEL: "error",
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
    assert.equal(proof.statusCode, 400);
    assert.equal(proof.json().error, "INVALID_PROOF");

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
        method: "POST", url: "/checkout/orders", cookies: customerCookies, payload: { ...payload, paymentMethod: "bank_transfer", idempotencyKey: randomUUID() },
      });
      assert.equal(bankOrder.statusCode, 201);
      assert.equal(bankOrder.json().payment.bankInstructionsAvailable, false);
      assert.equal(bankOrder.json().payment.bankTransfer, undefined);
      const bankNumber = bankOrder.json().order.orderNumber;
      const review = (decision) => app.inject({
        method: "PATCH", url: "/admin/orders/" + bankNumber + "/bank-transfer-review", cookies: adminCookies,
        payload: { decision, reason: "Synthetic transfer review" },
      });
      const unsubmitted = await review("approve");
      assert.equal(unsubmitted.statusCode, 409);
      assert.equal(unsubmitted.json().error, "PENDING_PROOF_NOT_FOUND");

      const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lLsAAAAASUVORK5CYII=";
      const proofPayload = { fileName: "test-receipt.png", mimeType: "image/png", dataBase64: image };
      const upload = (payload, cookies) => app.inject({
        method: "POST", url: "/checkout/orders/" + bankNumber + "/bank-transfer-proof", payload, cookies,
      });
      assert.equal((await upload(proofPayload)).statusCode, 404);
      const withToken = { ...proofPayload, accessToken: bankOrder.json().accessToken };
      assert.equal((await upload(withToken)).statusCode, 201);
      assert.equal((await upload(withToken)).statusCode, 409);

      const receiptPath = "/admin/orders/" + bankNumber + "/bank-transfer-proof";
      assert.equal((await app.inject(receiptPath)).statusCode, 401);
      const receipt = await app.inject({ url: receiptPath, cookies: adminCookies });
      assert.equal(receipt.statusCode, 200);
      assert.equal(receipt.headers["content-type"], "image/png");
      assert.equal(receipt.rawPayload.toString("base64"), image);
      assert.equal((await review("reject")).statusCode, 200);

      const rejected = await app.inject({ url: "/account/orders", cookies: customerCookies });
      assert.equal(rejected.json().orders.find((item) => item.order_number === bankNumber).receipt_status, "rejected");
      assert.equal((await upload(proofPayload, customerCookies)).statusCode, 201);
      assert.equal((await review("approve")).statusCode, 200);
      const approved = await db.query("SELECT status, payment_status FROM orders WHERE order_number=$1", [bankNumber]);
      assert.deepEqual(approved.rows[0], { status: "confirmed", payment_status: "paid" });

      const products = catalogue.json().products;
      const originalVariants = [products[0].variants[1], products[1].variants[0]];
      const mixed = await app.inject({
        method: "POST", url: "/checkout/orders", cookies: customerCookies,
        payload: { ...payload, idempotencyKey: randomUUID(), items: originalVariants.map((item) => ({ variantId: item.id, quantity: 1 })) },
      });
      assert.equal(mixed.statusCode, 201);
      const originalNumber = mixed.json().order.orderNumber;
      for (const status of ["processing", "shipped", "delivered"]) {
        const updated = await app.inject({
          method: "PATCH", url: "/admin/orders/" + originalNumber + "/status", cookies: adminCookies,
          payload: { status, reason: "Synthetic returns test" },
        });
        assert.equal(updated.statusCode, 200);
      }

      const eligible = await app.inject({ url: "/account/returns", cookies: customerCookies });
      const original = eligible.json().orders.find((item) => item.order_number === originalNumber);
      assert.equal(original.items.length, 2);
      const exchangeItem = original.items[0], refundItem = original.items[1];
      const replacementVariant = products.at(-1).variants[0];
      const request = {
        requestId: randomUUID(), orderId: original.id, kind: "exchange",
        reason: "Trying another fit", eligibleCondition: true,
        items: [{ id: exchangeItem.id, quantity: 1 }],
        replacement: [{ id: replacementVariant.id, quantity: 1 }],
      };
      const createRequest = (payload, cookies = customerCookies) => app.inject({
        method: "POST", url: "/account/returns", cookies, payload,
      });
      assert.equal((await createRequest(request, {})).statusCode, 401);
      await db.query("UPDATE orders SET delivered_at=now()-interval '8 days' WHERE id=$1", [original.id]);
      assert.equal((await createRequest(request)).statusCode, 409);
      await db.query("UPDATE orders SET delivered_at=now() WHERE id=$1", [original.id]);

      const exchange = await createRequest(request);
      assert.equal(exchange.statusCode, 201);
      assert.equal(exchange.json().creditMinor, exchangeItem.remainingMinor);
      assert.equal((await createRequest(request)).statusCode, 200);
      assert.equal((await createRequest({ ...request, requestId: randomUUID() })).statusCode, 409);

      const refund = { ...request, requestId: randomUUID(), kind: "refund", items: [{ id: refundItem.id, quantity: 1 }], replacement: [] };
      const filed = await createRequest(refund);
      assert.equal(filed.statusCode, 201);
      assert.equal(filed.json().creditMinor, refundItem.remainingMinor);
      const operate = (id, action, shippingMinor, cookies = adminCookies) => app.inject({
        method: "PATCH", url: "/admin/returns/" + id, cookies,
        payload: { action, shippingMinor, note: "Synthetic return review" },
      });
      assert.equal((await operate(refund.requestId, "approve", undefined, customerCookies)).statusCode, 401);
      const replacementOrder = await operate(request.requestId, "approve", 25000);
      assert.equal(replacementOrder.statusCode, 200);
      assert.equal((await operate(request.requestId, "approve", 25000)).statusCode, 409);
      const replacementPrice = Number(products.at(-1).price_minor);
      const originalCredit = Number(exchangeItem.remainingMinor);
      const totals = await db.query("SELECT subtotal_minor, discount_minor, shipping_minor, total_minor FROM orders WHERE id=$1", [replacementOrder.json().replacementOrderId]);
      assert.deepEqual(totals.rows[0], {
        subtotal_minor: String(replacementPrice), discount_minor: String(Math.min(replacementPrice, originalCredit)),
        shipping_minor: "25000", total_minor: String(Math.max(0, replacementPrice-originalCredit)+25000),
      });
      assert.equal((await operate(refund.requestId, "complete")).statusCode, 409);
      for (const action of ["approve", "receive", "complete"]) assert.equal((await operate(refund.requestId, action)).statusCode, 200);
      const refundDetails = await db.query("SELECT status, refund_minor FROM order_return_requests WHERE id=$1", [refund.requestId]);
      assert.deepEqual(refundDetails.rows[0], { status: "completed", refund_minor: refundItem.remainingMinor });
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
