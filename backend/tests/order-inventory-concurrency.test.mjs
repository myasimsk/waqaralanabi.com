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
