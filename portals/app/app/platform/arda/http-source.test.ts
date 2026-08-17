import { test } from "node:test";
import assert from "node:assert/strict";
import { ARDA_SIGNAL_TYPES, ARDA_TYPE_MAP, HttpArdaFactSource } from "./http-source";
import { getArdaConfig } from "./source";
import { ARDA_SOURCE } from "./port";

// The mapping rules, which are the whole safety story of this integration.
//
// signal's evidence columns have NO UPDATE GRANT. A wrong value there is
// repairable only by a db-init data correction, so every one of these asserts a
// refusal rather than a transformation.

const CONFIG = getArdaConfig({ ARDA_BASE_URL: "https://arda.invalid" });
const FETCHED = new Date("2026-08-16T12:00:00Z");
const source = new HttpArdaFactSource(CONFIG);

const fact = (over: Record<string, unknown> = {}) => ({
  id: "arda-rec-1",
  factType: "funding",
  subject: "Series B raised",
  observedAt: "2026-08-10T00:00:00Z",
  ...over,
});

test("an unmapped fact type is counted and dropped, never coerced to 'other'", () => {
  // Coercion would manufacture FROZEN evidence of a type nobody chose - and
  // 'other' scores differently, so the fabrication propagates into ranking.
  const r = source.map({ facts: [fact({ factType: "merger_rumour" })] }, FETCHED);
  assert.equal(r.signals.length, 0);
  assert.equal(r.unmapped, 1);
});

test("every mapped type is one the database CHECK actually allows", () => {
  // chk_signal_type is a seven-value CHECK. A mapping table that drifted from
  // it would fail at INSERT with a constraint error, in a background job, at
  // whatever hour the timer runs.
  for (const v of Object.values(ARDA_TYPE_MAP)) {
    assert.ok(
      (ARDA_SIGNAL_TYPES as readonly string[]).includes(v),
      `${v} is not a signal type this product has`,
    );
  }
});

test("an over-length identity is dropped, not truncated", () => {
  const long = "x".repeat(256);
  const r = source.map({ facts: [fact({ id: long })] }, FETCHED);
  assert.equal(r.signals.length, 0);
  assert.equal(r.unmapped, 1);
});

test("two distinct over-length ids do not collapse into one source_ref", () => {
  // This is why truncation is worse than dropping. A collision on
  // uidx_signal_ws_source_ref makes the second record permanently invisible
  // while recordSignal reports it as a healthy duplicate.
  const a = "y".repeat(300) + "AAA";
  const b = "y".repeat(300) + "BBB";
  const r = source.map({ facts: [fact({ id: a }), fact({ id: b })] }, FETCHED);
  assert.equal(r.signals.length, 0, "both refused");
  assert.equal(r.unmapped, 2);
});

test("an over-length subject is dropped rather than cut to fit", () => {
  // 256, not 513. The column is VARCHAR(255), and the old fixture only ever
  // exercised a length so far past the real limit that a wrong constant could
  // not fail it - which is exactly what happened: the guard said 512, so
  // everything between 256 and 512 sailed through to a Postgres 22001 that
  // aborted the whole batch.
  const r = source.map({ facts: [fact({ subject: "s".repeat(256) })] }, FETCHED);
  assert.equal(r.signals.length, 0);
  assert.equal(r.unmapped, 1);

  assert.equal(source.map({ facts: [fact({ subject: "s".repeat(255) })] }, FETCHED).signals.length, 1);
});

test("detectedAt comes from arda's true-as-of, never from fetch time", () => {
  // The two differ by six days in this fixture. detected_at is frozen on
  // insert, so taking the wrong one permanently records that something was
  // detected at the moment a cron happened to run.
  const r = source.map({ facts: [fact({ observedAt: "2026-08-10T00:00:00Z" })] }, FETCHED);
  assert.equal(r.signals.length, 1);
  assert.equal(r.signals[0].detectedAt?.toISOString(), "2026-08-10T00:00:00.000Z");
  assert.notEqual(r.signals[0].detectedAt?.toISOString(), FETCHED.toISOString());
  assert.equal(r.fetchedAt.toISOString(), FETCHED.toISOString());
});

test("a fact with no usable timestamp is dropped rather than stamped now", () => {
  // A record that cannot say when it was true is not evidence.
  for (const bad of [undefined, "not-a-date", 12345]) {
    const r = source.map({ facts: [fact({ observedAt: bad })] }, FETCHED);
    assert.equal(r.signals.length, 0, `observedAt=${String(bad)}`);
    assert.equal(r.unmapped, 1);
  }
});

test("arda never supplies the resolution half of the row", () => {
  // account_id, score and status are yucer's absolutely. A feed that could name
  // the account could rewrite attribution - and account_id is frozen too.
  const r = source.map(
    { facts: [fact({ accountId: "acc-from-arda", score: 99, status: "promoted" })] },
    FETCHED,
  );
  assert.equal(r.signals.length, 1);
  assert.equal(r.signals[0].accountId, undefined);
  assert.equal(r.signals[0].source, ARDA_SOURCE);
  assert.equal("score" in r.signals[0], false);
  assert.equal("status" in r.signals[0], false);
});

test("a malformed body yields nothing rather than throwing", () => {
  for (const body of [null, {}, { facts: "nope" }, { facts: [] }]) {
    const r = source.map(body, FETCHED);
    assert.deepEqual(r.signals, []);
    assert.equal(r.unmapped, 0);
  }
});

test("a caller-held cursor is surfaced rather than swallowed", () => {
  // If arda turns out to require one, ADR-011's zero-DDL claim dies and a
  // watermark table appears. Silently dropping it would hide that.
  const withCursor = source.map({ facts: [], cursor: "abc" }, FETCHED);
  assert.equal(withCursor.cursor, "abc");
  const without = source.map({ facts: [] }, FETCHED);
  assert.equal(without.cursor, undefined);
});

// --- the transport ---------------------------------------------------------

test("the adapter issues GET only, and sends no yucer row id anywhere", async () => {
  // The structural guard against stage 2 arriving one small improvement at a
  // time. Stage 1 is inbound; asserting the property beats reviewing for it.
  const seen: { url: string; init: RequestInit }[] = [];
  const s = new HttpArdaFactSource(CONFIG, {
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ facts: [] }), { status: 200 });
    },
    mintToken: async () => ({ accessToken: "t", expiresAt: 0, audience: "arda", mode: "service" }),
  });

  await s.fetchSignals(
    { workspaceId: "ws_1", tenantId: "tn_1" },
    new Date("2026-08-01T00:00:00Z"),
    50,
  );

  assert.equal(seen.length, 1);
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.body, undefined);
  for (const rowId of ["acc_demo_1", "opp_demo_1", "ws_1_secret"]) {
    assert.equal(seen[0].url.includes(rowId), false, `${rowId} must not leave`);
  }
});

test("both injected dependencies are honoured, so a test never reaches the real IdP", async () => {
  // The direct anti-regression for the discarded karda client, which passed
  // three positional arguments to a two-parameter mintS2SToken. A test
  // injecting a stub fetch there would have reached the production IdP and then
  // passed for the wrong reason.
  let minted = 0;
  const s = new HttpArdaFactSource(CONFIG, {
    fetchImpl: async () => new Response(JSON.stringify({ facts: [] }), { status: 200 }),
    mintToken: async () => {
      minted += 1;
      return { accessToken: "t", expiresAt: 0, audience: "arda", mode: "service" };
    },
  });
  await s.fetchSignals({ workspaceId: "ws", tenantId: "tn" }, new Date(), 10);
  assert.equal(minted, 1, "the injected minter was used, not the real one");
});

test("a non-2xx from arda throws rather than reporting an empty quiet feed", async () => {
  const s = new HttpArdaFactSource(CONFIG, {
    fetchImpl: async () => new Response("nope", { status: 503 }),
    mintToken: async () => ({ accessToken: "t", expiresAt: 0, audience: "arda", mode: "service" }),
  });
  await assert.rejects(
    () => s.fetchSignals({ workspaceId: "ws", tenantId: "tn" }, new Date(), 10),
    /503/,
  );
});
