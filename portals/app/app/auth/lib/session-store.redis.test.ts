import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import {
  putSession, getSession, deleteSession, revokeSid, updateSession,
  acquireCheckLock, releaseCheckLock, closeSessionStore, type RpSession,
} from "./session-store";

const url = process.env.AUTH_TEST_REDIS_URL;
if (url) process.env.REDIS_URL = url;
const cid = `yucer-contract-${randomUUID()}`;
const session: RpSession = {
  sub: "user-a", sid: "central-a", accessToken: "test-at", idToken: "test-id",
  accessExpiresAt: Date.now() / 1000 + 300, claims: { sub: "user-a" },
};

after(async () => {
  if (!url) return;
  const client = new Redis(url);
  // Never FLUSHDB: delete only this run's generated namespace.
  let cursor = "0";
  do {
    const result = await client.scan(cursor, "MATCH", `vx:rp:${cid}:*`, "COUNT", 100);
    cursor = result[0];
    if (result[1].length) await client.del(...result[1]);
  } while (cursor !== "0");
  await client.quit();
  await closeSessionStore();
});

test("real Redis: logout removes every RP for a sid, preserves other accounts, and blocks late callbacks", { skip: !url }, async () => {
  assert.equal(await putSession(cid, "a1", session, 60), true);
  assert.equal(await putSession(cid, "a2", session, 60), true);
  assert.equal(await putSession(cid, "b1", { ...session, sid: "central-b", sub: "user-b" }, 60), true);
  await revokeSid(cid, "central-a", 60);
  assert.equal(await getSession(cid, "a1"), null);
  assert.equal(await getSession(cid, "a2"), null);
  assert.equal((await getSession(cid, "b1"))?.sub, "user-b");
  assert.equal(await putSession(cid, "late-a", session, 60), false);
  await revokeSid(cid, "central-a", 60);
  assert.equal((await getSession(cid, "b1"))?.sub, "user-b");
});

test("real Redis: a response returning after local logout cannot recreate its RP", { skip: !url }, async () => {
  const before = { ...session, sid: "delete-race" };
  await putSession(cid, "race-local", before, 60);
  const lease = await acquireCheckLock(cid, "race-local", 20);
  assert.ok(lease);
  await deleteSession(cid, "race-local");
  assert.equal(await updateSession(cid, "race-local", before, { ...before, accessToken: "late" }, 60, lease), false);
  assert.equal(await getSession(cid, "race-local"), null);
  await releaseCheckLock(cid, "race-local", lease);
});

test("real Redis: expired lease holders cannot overwrite or unlock a new checker's result", { skip: !url }, async () => {
  const before = { ...session, sid: "lease-race" };
  await putSession(cid, "race-lease", before, 60);
  const expired = await acquireCheckLock(cid, "race-lease", 1);
  assert.ok(expired);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const current = await acquireCheckLock(cid, "race-lease", 20);
  assert.ok(current);
  await releaseCheckLock(cid, "race-lease", expired);
  assert.equal(await acquireCheckLock(cid, "race-lease", 20), null, "old holder cannot release the new lease");
  assert.equal(await updateSession(cid, "race-lease", before, { ...before, accessToken: "stale" }, 60, expired), false);
  const next = { ...before, accessToken: "new" };
  assert.equal(await updateSession(cid, "race-lease", before, next, 60, current), true);
  assert.equal(await updateSession(cid, "race-lease", before, { ...before, accessToken: "stale" }, 60, current), false);
  assert.equal((await getSession(cid, "race-lease"))?.accessToken, "new");
  await releaseCheckLock(cid, "race-lease", current);
});

test("real Redis: back-channel revocation racing with updates always wins", { skip: !url }, async () => {
  for (let i = 0; i < 12; i++) {
    const rp = `parallel-${i}`;
    const before = { ...session, sid: `parallel-sid-${i}` };
    await putSession(cid, rp, before, 60);
    const lease = await acquireCheckLock(cid, rp, 20);
    assert.ok(lease);
    await Promise.all([
      updateSession(cid, rp, before, { ...before, accessToken: "late" }, 60, lease),
      revokeSid(cid, before.sid!, 60),
    ]);
    assert.equal(await getSession(cid, rp), null);
    assert.equal(await putSession(cid, `${rp}-callback`, before, 60), false);
    await releaseCheckLock(cid, rp, lease);
  }
});
