import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.TEST_DATABASE_URL;

test("concurrent stock reservations cannot sell the final unit twice", { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString, max: 6 });
  const schema = "wa_test_" + randomUUID().replaceAll("-", "");
  const q = (name) => '"' + schema + '"."' + name + '"';
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE ${q("variants")} (
      id integer PRIMARY KEY,
      stock_on_hand integer NOT NULL CHECK (stock_on_hand >= 0),
      reserved_quantity integer NOT NULL CHECK (reserved_quantity >= 0 AND reserved_quantity <= stock_on_hand)
    )`);
    await pool.query(`INSERT INTO ${q("variants")} VALUES (1, 1, 0)`);

    async function reserve() {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query(
          `SELECT stock_on_hand, reserved_quantity FROM ${q("variants")} WHERE id=1 FOR UPDATE`
        );
        const row = current.rows[0];
        if (row.stock_on_hand - row.reserved_quantity < 1) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query(
          `UPDATE ${q("variants")} SET reserved_quantity=reserved_quantity+1 WHERE id=1`
        );
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    const outcomes = await Promise.all([reserve(), reserve()]);
    assert.equal(outcomes.filter(Boolean).length, 1);
    const final = await pool.query(`SELECT stock_on_hand,reserved_quantity FROM ${q("variants")} WHERE id=1`);
    assert.deepEqual(final.rows[0], { stock_on_hand: 1, reserved_quantity: 1 });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});

test("parallel checkout retries with one idempotency key serialize to one order", { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString, max: 6 });
  const schema = "wa_test_" + randomUUID().replaceAll("-", "");
  const q = (name) => '"' + schema + '"."' + name + '"';
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE ${q("orders")} (
      id bigserial PRIMARY KEY, idempotency_key text UNIQUE NOT NULL
    )`);

    async function submit() {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["same-checkout-key"]);
        const existing = await client.query(
          `SELECT id FROM ${q("orders")} WHERE idempotency_key=$1`,
          ["same-checkout-key"]
        );
        if (existing.rowCount) {
          await client.query("ROLLBACK");
          return existing.rows[0].id;
        }
        const inserted = await client.query(
          `INSERT INTO ${q("orders")}(idempotency_key) VALUES($1) RETURNING id`,
          ["same-checkout-key"]
        );
        await client.query("COMMIT");
        return inserted.rows[0].id;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    const ids = await Promise.all([submit(), submit(), submit(), submit()]);
    assert.equal(new Set(ids.map(String)).size, 1);
    const count = await pool.query(`SELECT count(*)::int AS count FROM ${q("orders")}`);
    assert.equal(count.rows[0].count, 1);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});

test("database rejects a second pending receipt for the same order", { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString, max: 2 });
  const schema = "wa_test_" + randomUUID().replaceAll("-", "");
  const q = (name) => '"' + schema + '"."' + name + '"';
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE ${q("proofs")} (
      id bigserial PRIMARY KEY, order_id integer NOT NULL, review_status text NOT NULL
    )`);
    await pool.query(`CREATE UNIQUE INDEX one_pending_per_order ON ${q("proofs")}(order_id) WHERE review_status='pending'`);
    await pool.query(`INSERT INTO ${q("proofs")}(order_id,review_status) VALUES(7,'pending')`);
    await assert.rejects(
      pool.query(`INSERT INTO ${q("proofs")}(order_id,review_status) VALUES(7,'pending')`),
      (error) => error.code === "23505"
    );
    await pool.query(`INSERT INTO ${q("proofs")}(order_id,review_status) VALUES(7,'rejected')`);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});


// These database-level tests exercise the transaction invariants used by the
// checkout routes. They do not replace HTTP-level route integration tests.
test("an order cannot acquire a second payment record", { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString, max: 2 });
  const schema = "wa_test_" + randomUUID().replaceAll("-", "");
  const q = (name) => '"' + schema + '"."' + name + '"';
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE ${q("payments")} (
      id bigserial PRIMARY KEY, order_id integer NOT NULL
    )`);
    await pool.query(`CREATE UNIQUE INDEX one_payment_per_order ON ${q("payments")}(order_id)`);
    await pool.query(`INSERT INTO ${q("payments")}(order_id) VALUES(42)`);
    await assert.rejects(
      pool.query(`INSERT INTO ${q("payments")}(order_id) VALUES(42)`),
      (error) => error.code === "23505"
    );
    await pool.query(`INSERT INTO ${q("payments")}(order_id) VALUES(43)`);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});

test("bank-transfer approval commits payment and stock atomically; rejection and cancellation preserve the right stock state", { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString, max: 4 });
  const schema = "wa_test_" + randomUUID().replaceAll("-", "");
  const q = (name) => '"' + schema + '"."' + name + '"';
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`CREATE TABLE ${q("orders")} (
      id integer PRIMARY KEY, status text NOT NULL, payment_status text NOT NULL
    )`);
    await pool.query(`CREATE TABLE ${q("variants")} (
      id integer PRIMARY KEY, stock_on_hand integer NOT NULL,
      reserved_quantity integer NOT NULL CHECK(reserved_quantity >= 0 AND reserved_quantity <= stock_on_hand)
    )`);
    await pool.query(`CREATE TABLE ${q("payments")} (
      order_id integer PRIMARY KEY, status text NOT NULL
    )`);
    await pool.query(`CREATE TABLE ${q("items")} (
      order_id integer NOT NULL, variant_id integer NOT NULL, quantity integer NOT NULL
    )`);
    await pool.query(`CREATE TABLE ${q("proofs")} (
      order_id integer NOT NULL, review_status text NOT NULL, review_reason text
    )`);
    await pool.query(`INSERT INTO ${q("orders")} VALUES (1,'pending_payment','pending'),(2,'pending_payment','pending'),(3,'pending_payment','pending')`);
    await pool.query(`INSERT INTO ${q("variants")} VALUES (1,10,2),(2,10,3),(3,10,1)`);
    await pool.query(`INSERT INTO ${q("payments")} VALUES (1,'pending'),(2,'pending'),(3,'pending')`);
    await pool.query(`INSERT INTO ${q("items")} VALUES (1,1,2),(2,2,3),(3,3,1)`);
    await pool.query(`INSERT INTO ${q("proofs")} VALUES (1,'pending',NULL),(2,'pending',NULL),(3,'pending',NULL)`);

    // Approval: receipt, payment, stock and order state move in one transaction.
    const approve = await pool.connect();
    try {
      await approve.query("BEGIN");
      await approve.query(`UPDATE ${q("proofs")} SET review_status='approved' WHERE order_id=1 AND review_status='pending'`);
      const paid = await approve.query(`UPDATE ${q("payments")} SET status='paid' WHERE order_id=1 AND status='pending' RETURNING order_id`);
      assert.equal(paid.rowCount, 1);
      const consumed = await approve.query(`UPDATE ${q("variants")} v
        SET stock_on_hand=v.stock_on_hand-i.quantity,
            reserved_quantity=v.reserved_quantity-i.quantity
        FROM ${q("items")} i
        WHERE i.order_id=1 AND i.variant_id=v.id
          AND v.stock_on_hand>=i.quantity AND v.reserved_quantity>=i.quantity`);
      assert.equal(consumed.rowCount, 1);
      await approve.query(`UPDATE ${q("orders")} SET payment_status='paid',status='confirmed' WHERE id=1`);
      await approve.query("COMMIT");
    } catch (error) {
      await approve.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      approve.release();
    }
    const approved = await pool.query(`SELECT o.status,o.payment_status,p.status AS proof_status,pm.status AS payment_state,v.stock_on_hand,v.reserved_quantity
      FROM ${q("orders")} o JOIN ${q("proofs")} p ON p.order_id=o.id
      JOIN ${q("payments")} pm ON pm.order_id=o.id JOIN ${q("variants")} v ON v.id=1 WHERE o.id=1`);
    assert.deepEqual(approved.rows[0], {
      status: "confirmed", payment_status: "paid", proof_status: "approved",
      payment_state: "paid", stock_on_hand: 8, reserved_quantity: 0
    });

    // Rejection does not consume stock or mark the payment paid; the customer may retry.
    await pool.query(`UPDATE ${q("proofs")} SET review_status='rejected',review_reason='Receipt unclear' WHERE order_id=2`);
    const rejected = await pool.query(`SELECT p.review_status,pm.status,v.stock_on_hand,v.reserved_quantity
      FROM ${q("proofs")} p JOIN ${q("payments")} pm ON pm.order_id=p.order_id
      JOIN ${q("variants")} v ON v.id=2 WHERE p.order_id=2`);
    assert.deepEqual(rejected.rows[0], {
      review_status: "rejected", status: "pending", stock_on_hand: 10, reserved_quantity: 3
    });

    // Cancellation rejects any pending proof and releases the reservation.
    const cancel = await pool.connect();
    try {
      await cancel.query("BEGIN");
      await cancel.query(`UPDATE ${q("proofs")} SET review_status='rejected',review_reason='Order cancelled' WHERE order_id=3 AND review_status='pending'`);
      const released = await cancel.query(`UPDATE ${q("variants")} v
        SET reserved_quantity=v.reserved_quantity-i.quantity
        FROM ${q("items")} i
        WHERE i.order_id=3 AND i.variant_id=v.id AND v.reserved_quantity>=i.quantity`);
      assert.equal(released.rowCount, 1);
      await cancel.query(`UPDATE ${q("orders")} SET status='cancelled' WHERE id=3`);
      await cancel.query("COMMIT");
    } catch (error) {
      await cancel.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      cancel.release();
    }
    const cancelled = await pool.query(`SELECT o.status,p.review_status,pm.status AS payment_state,v.stock_on_hand,v.reserved_quantity
      FROM ${q("orders")} o JOIN ${q("proofs")} p ON p.order_id=o.id
      JOIN ${q("payments")} pm ON pm.order_id=o.id JOIN ${q("variants")} v ON v.id=3 WHERE o.id=3`);
    assert.deepEqual(cancelled.rows[0], {
      status: "cancelled", review_status: "rejected", payment_state: "pending",
      stock_on_hand: 10, reserved_quantity: 0
    });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
