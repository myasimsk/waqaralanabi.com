import { db } from "../db/pool.js";
import { env } from "../config/env.js";

type CustomerSeed = {
  key: string;
  email: string;
  fullName: string;
  phone: string;
  address: {
    line1: string;
    city: string;
    region: string;
    postalCode: string;
  };
};

const customers: CustomerSeed[] = [
  {
    key: "sarah",
    email: "sarah.ahmed.demo@example.test",
    fullName: "Sarah Ahmed",
    phone: "+923001110001",
    address: { line1: "12 Demo Street, F-7", city: "Islamabad", region: "ICT", postalCode: "44000" },
  },
  {
    key: "ali",
    email: "ali.raza.demo@example.test",
    fullName: "Ali Raza",
    phone: "+923001110002",
    address: { line1: "24 Sample Avenue, DHA", city: "Lahore", region: "Punjab", postalCode: "54000" },
  },
  {
    key: "ayesha",
    email: "ayesha.khan.demo@example.test",
    fullName: "Ayesha Khan",
    phone: "+923001110003",
    address: { line1: "8 Test Road, Clifton", city: "Karachi", region: "Sindh", postalCode: "75600" },
  },
];

const orderSeeds = [
  { number: "WAA-DEMO-1001", customer: "sarah", status: "delivered", paymentStatus: "paid", total: 1850000, placedDaysAgo: 18, items: [
    { product: "Polo Shirt", sku: "WA-POLO-BLK-M", size: "M", color: "Black", quantity: 1, unit: 750000 },
    { product: "Relaxed Pleated Trousers", sku: "WA-TRS-BGE-M", size: "M", color: "Beige", quantity: 1, unit: 1100000 },
  ]},
  { number: "WAA-DEMO-1002", customer: "ali", status: "processing", paymentStatus: "paid", total: 1290000, placedDaysAgo: 7, items: [
    { product: "Polo Shirt", sku: "WA-POLO-WHT-L", size: "L", color: "White", quantity: 1, unit: 750000 },
    { product: "Boxy Fit T-Shirt", sku: "WA-TEE-BRG-L", size: "L", color: "Burgundy", quantity: 1, unit: 540000 },
  ]},
  { number: "WAA-DEMO-1003", customer: "ayesha", status: "shipped", paymentStatus: "paid", total: 2450000, placedDaysAgo: 4, items: [
    { product: "Women's Co-ord Set", sku: "WA-CORD-CRM-S", size: "S", color: "Cream", quantity: 1, unit: 1450000 },
    { product: "Wide Leg Trousers", sku: "WA-WTRS-CHC-S", size: "S", color: "Chocolate", quantity: 1, unit: 1000000 },
  ]},
  { number: "WAA-DEMO-1004", customer: "sarah", status: "pending_payment", paymentStatus: "pending", total: 890000, placedDaysAgo: 1, items: [
    { product: "Sweatshirt", sku: "WA-SWT-BGE-M", size: "M", color: "Beige", quantity: 1, unit: 890000 },
  ]},
  { number: "WAA-DEMO-1005", customer: "ali", status: "cancelled", paymentStatus: "refunded", total: 1290000, placedDaysAgo: 12, items: [
    { product: "Relaxed Pleated Trousers", sku: "WA-TRS-BLK-L", size: "L", color: "Black", quantity: 1, unit: 1290000 },
  ]},
] as const;

async function main(): Promise<void> {
  if (env.NODE_ENV !== "development") {
    throw new Error("Demo seeding is allowed only when NODE_ENV=development.");
  }

  const database = await db.query<{ name: string }>("SELECT current_database() AS name");
  if (database.rows[0]?.name !== "wa_store_dev") {
    throw new Error("Safety stop: demo seeding requires the local wa_store_dev database.");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const adminResult = await client.query<{ id: string }>(
      "SELECT id FROM admin_users WHERE is_active = true AND role = 'owner' ORDER BY created_at ASC LIMIT 1",
    );
    const ownerId = adminResult.rows[0]?.id;
    if (!ownerId) throw new Error("No active owner admin exists. Create the local admin account first.");

    const customerIds: Record<string, string> = {};
    for (const customer of customers) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO customers (email, full_name, phone, email_verified_at, account_activated_at)
         VALUES ($1, $2, $3, now(), now())
         ON CONFLICT (email_normalized) DO UPDATE
           SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, status = 'active', updated_at = now()
         RETURNING id`,
        [customer.email, customer.fullName, customer.phone],
      );
      customerIds[customer.key] = result.rows[0]!.id;
    }

    const orderIds: Record<string, string> = {};
    for (const order of orderSeeds) {
      const customer = customers.find((entry) => entry.key === order.customer)!;
      const customerId = customerIds[order.customer];
      const addressSnapshot = {
        recipientName: customer.fullName,
        phone: customer.phone,
        addressLine1: customer.address.line1,
        city: customer.address.city,
        region: customer.address.region,
        postalCode: customer.address.postalCode,
        countryCode: "PK",
      };
      const placedDaysAgo = order.placedDaysAgo;
      const result = await client.query<{ id: string }>(
        `INSERT INTO orders
          (order_number, customer_id, guest_email, currency, subtotal_minor, discount_minor, shipping_minor, tax_minor,
           total_minor, status, payment_status, shipping_address_snapshot, billing_address_snapshot, placed_at)
         VALUES ($1, $2, $3, 'PKR', $4, 0, 0, 0, $4, $5::order_status, $6::payment_status,
                 $7::jsonb, $7::jsonb, now() - ($8::text || ' days')::interval)
         ON CONFLICT (order_number) DO UPDATE SET
           customer_id = EXCLUDED.customer_id, guest_email = EXCLUDED.guest_email, currency = EXCLUDED.currency,
           subtotal_minor = EXCLUDED.subtotal_minor, total_minor = EXCLUDED.total_minor,
           status = EXCLUDED.status, payment_status = EXCLUDED.payment_status,
           shipping_address_snapshot = EXCLUDED.shipping_address_snapshot,
           billing_address_snapshot = EXCLUDED.billing_address_snapshot, placed_at = EXCLUDED.placed_at,
           updated_at = now()
         RETURNING id`,
        [order.number, customerId, customer.email, order.total, order.status, order.paymentStatus,
          JSON.stringify(addressSnapshot), String(placedDaysAgo)],
      );
      orderIds[order.number] = result.rows[0]!.id;
    }

    // Dedicated synthetic guest order for exercising first-order account registration.
    const registrationEmail = "new.member.demo@example.test";
    const registrationOrder = await client.query<{ id: string }>(
      `INSERT INTO orders
        (order_number, customer_id, guest_email, currency, subtotal_minor, discount_minor, shipping_minor, tax_minor,
         total_minor, status, payment_status, shipping_address_snapshot, billing_address_snapshot, placed_at)
       VALUES ('WAA-DEMO-REG-1001', NULL, $1, 'PKR', 750000, 0, 0, 0, 750000,
               'delivered', 'paid', $2::jsonb, $2::jsonb, now() - interval '2 days')
       ON CONFLICT (order_number) DO UPDATE SET
         customer_id = NULL, guest_email = EXCLUDED.guest_email, currency = EXCLUDED.currency,
         subtotal_minor = EXCLUDED.subtotal_minor, total_minor = EXCLUDED.total_minor,
         status = EXCLUDED.status, payment_status = EXCLUDED.payment_status,
         shipping_address_snapshot = EXCLUDED.shipping_address_snapshot,
         billing_address_snapshot = EXCLUDED.billing_address_snapshot, placed_at = EXCLUDED.placed_at,
         updated_at = now()
       RETURNING id`,
      [registrationEmail, JSON.stringify({
        recipientName: "New Member Demo", phone: "+923001119999",
        addressLine1: "Demo Registration Address", city: "Islamabad",
        region: "ICT", postalCode: "44000", countryCode: "PK",
      })],
    );
    const registrationOrderId = registrationOrder.rows[0]!.id;
    await client.query("DELETE FROM order_items WHERE order_id = $1", [registrationOrderId]);
    await client.query("DELETE FROM payments WHERE order_id = $1", [registrationOrderId]);
    await client.query(
      `INSERT INTO order_items
        (order_id, product_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot,
         quantity, unit_price_minor, line_total_minor)
       VALUES ($1, 'WA-POLO-BRG-M', 'Polo Shirt', 'WA-POLO-BRG-M', 'M', 'Burgundy', 1, 750000, 750000)`,
      [registrationOrderId],
    );
    await client.query(
      `INSERT INTO payments (order_id, provider, provider_reference, amount_minor, currency, status, idempotency_key, paid_at)
       VALUES ($1, 'demo', 'DEMO-PAY-WAA-DEMO-REG-1001', 750000, 'PKR', 'paid',
               'demo-seed:WAA-DEMO-REG-1001', now() - interval '2 days')`,
      [registrationOrderId],
    );

    const seededOrderIds = Object.values(orderIds);
    await client.query("DELETE FROM order_items WHERE order_id = ANY($1::uuid[])", [seededOrderIds]);
    await client.query("DELETE FROM payments WHERE order_id = ANY($1::uuid[])", [seededOrderIds]);

    for (const order of orderSeeds) {
      const orderId = orderIds[order.number];
      for (const item of order.items) {
        await client.query(
          `INSERT INTO order_items
            (order_id, product_id, product_name_snapshot, sku_snapshot, size_snapshot, color_snapshot,
             quantity, unit_price_minor, line_total_minor)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [orderId, item.sku, item.product, item.sku, item.size, item.color, item.quantity,
            item.unit, item.unit * item.quantity],
        );
      }

      const paymentStatus = order.paymentStatus;
      await client.query(
        `INSERT INTO payments (order_id, provider, provider_reference, amount_minor, currency, status, idempotency_key, paid_at)
         VALUES ($1, 'demo', $2, $3, 'PKR', $4::payment_status, $5, $6)`,
        [orderId, `DEMO-PAY-${order.number}`, order.total, paymentStatus,
          `demo-seed:${order.number}`, paymentStatus === "pending" ? null : new Date(Date.now() - order.placedDaysAgo * 86_400_000)],
      );
    }

    for (const customer of customers) {
      const customerId = customerIds[customer.key];
      await client.query(
        `INSERT INTO loyalty_accounts (customer_id, points_balance, lifetime_earned)
         VALUES ($1, 0, 0) ON CONFLICT (customer_id) DO NOTHING`,
        [customerId],
      );
      await client.query("DELETE FROM customer_addresses WHERE customer_id = $1 AND label = 'Demo seed'", [customerId]);
      await client.query(
        `INSERT INTO customer_addresses
          (customer_id, label, recipient_name, phone, address_line_1, city, region, postal_code, country_code, is_default)
         VALUES ($1, 'Demo seed', $2, $3, $4, $5, $6, $7, 'PK', true)`,
        [customerId, customer.fullName, customer.phone, customer.address.line1, customer.address.city,
          customer.address.region, customer.address.postalCode],
      );
    }

    await client.query("DELETE FROM admin_audit_logs WHERE metadata->>'seedKey' = 'wa-demo-seed-v1'");
    await client.query(
      `INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, reason, metadata)
       VALUES ($1, 'demo.seed_created', 'development', 'Local dashboard verification data',
               jsonb_build_object('seedKey', 'wa-demo-seed-v1', 'customers', 3, 'orders', 5, 'items', 8))`,
      [ownerId],
    );

    await client.query("COMMIT");
    process.stdout.write("Demo data seeded successfully in wa_store_dev.\n");
    process.stdout.write("Customers: 3 | Orders: 6 (including one guest registration test order) | Order items: 9 | Addresses: 3 | Audit entries: 1\n");
    process.stdout.write("All records use example.test emails and WAA-DEMO order numbers. Registration test: WAA-DEMO-REG-1001 / new.member.demo@example.test.\n");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error("Demo data seeding failed:", error);
  process.exitCode = 1;
  void db.end();
});
