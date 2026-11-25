import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import { getPrismaClient, withDomainTransaction } from "../../lib/db";
import { readJudgementRevision } from "./feed-revision";

test("service role reads only workspace revision metadata; inserts, updates without timestamps and deletes invalidate it", {
  skip: process.env.DATABASE_URL ? false : "no DATABASE_URL",
}, async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const workspaceId = randomUUID(), foreign = randomUUID(), id = randomUUID();
  const read = (ws = workspaceId) => withDomainTransaction(async () => {
    const p = await getPrismaClient();
    await p.$executeRaw`SET LOCAL ROLE yucer_svc`;
    return readJudgementRevision(ws);
  });
  try {
    const empty = await read();
    assert.match(empty!, /^[a-f0-9]{64}$/);
    assert.equal(empty, await read());
    await c.query("INSERT INTO yucer_core.account (id, workspace_id, account_no, name) VALUES ($1, $2, 'revision-test', 'Test')", [id, workspaceId]);
    const inserted = await read(); assert.notEqual(inserted, empty);
    await c.query("UPDATE yucer_core.account SET name='Updated' WHERE id=$1", [id]);
    const updated = await read(); assert.notEqual(updated, inserted);
    await c.query("INSERT INTO yucer_core.account (workspace_id, account_no, name) VALUES ($1, 'revision-test', 'Foreign')", [foreign]);
    assert.equal(await read(), updated, "a different tenant's writes cannot invalidate this report");
    assert.notEqual(await read(foreign), empty);
    await c.query("DELETE FROM yucer_core.account WHERE id=$1", [id]);
    assert.equal(await read(), empty);
  } finally {
    await c.query("DELETE FROM yucer_core.account WHERE workspace_id IN ($1,$2)", [workspaceId, foreign]);
    await c.end();
  }
});
