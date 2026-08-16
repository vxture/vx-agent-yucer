import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS } from "../../authz/actions";
import { getSignalStore, setSignalStore } from "../../domains/shared/registry";
import { InMemorySignalStore } from "../../domains/signal/store";
import { NullArdaFactSource, getArdaConfig, getArdaFactSource, setArdaFactSource } from "./source";
import { ARDA_SOURCE, type ArdaContext, type ArdaFactSource, type ArdaFetch } from "./port";
import { ARDA_SYNC_PERMISSIONS, runArdaSync } from "./sync";

const WS = [{ workspaceId: "ws_1", tenantId: "tn_1" }];
const NOW = new Date("2026-08-16T00:00:00Z");

class StubSource implements ArdaFactSource {
  readonly configured = true;
  calls: { since: Date; limit: number }[] = [];
  constructor(private readonly batches: ArdaFetch[]) {}
  async fetchSignals(_ctx: ArdaContext, since: Date, limit: number): Promise<ArdaFetch> {
    this.calls.push({ since, limit });
    return this.batches.shift() ?? { signals: [], unmapped: 0, asOf: null, fetchedAt: NOW };
  }
}

const batch = (n: number, unmapped = 0): ArdaFetch => ({
  signals: Array.from({ length: n }, (_u, i) => ({
    source: ARDA_SOURCE,
    sourceRef: `arda-${i}`,
    signalType: "funding" as const,
    subject: `fact ${i}`,
    detectedAt: new Date("2026-08-14T00:00:00Z"),
  })),
  unmapped,
  asOf: new Date("2026-08-14T00:00:00Z"),
  fetchedAt: NOW,
});

function freshStore() {
  const store = new InMemorySignalStore();
  setSignalStore(store);
  return store;
}

test("ingesting needs triage, not admin - a background job must not hold the strongest permission", () => {
  // The back door ADR-010 rule 2 exists to close: if the sync subject needed
  // admin.manage, the job would run with the catalogue's strongest permission
  // to write rows a triager is trusted with.
  const ingest = ACTIONS["signal.feed.ingest"];
  assert.equal(ingest.permission, "signal.triage");
  assert.equal(ingest.feature, "signal.external_feed");
  assert.notEqual(ingest.permission, "admin.manage");

  // The subject carries exactly that one permission and nothing else. Borrowing
  // a role instead would hand a background job everything a salesperson holds -
  // and the first draft of this file did exactly that, with a role that turned
  // out not to hold signal.triage at all, so the job would have been denied on
  // every run with nobody watching.
  assert.deepEqual([...ARDA_SYNC_PERMISSIONS], ["signal.triage"]);
});

test("unconfigured reports disabled, not failure", async () => {
  // A job deliberately switched off must not be dressed as a fault, or the
  // first real failure reads as more of the same.
  setArdaFactSource(new NullArdaFactSource());
  const led = await runArdaSync({ workspaces: WS, now: NOW });
  assert.equal(led.status, "disabled");
  assert.equal(led.attempted, 0);
  assert.equal(led.recorded, 0);
  setArdaFactSource(null);
});

test("a below-tier workspace is counted as skipped, never silently omitted", async () => {
  // ADR-010 rule 5: a sweep that cannot tell "not entitled" from "nothing to
  // do" lets everyone assume the work happened.
  freshStore();
  process.env.MOCK_TIER = "free";
  const src = new StubSource([batch(3)]);
  const led = await runArdaSync({ workspaces: WS, source: src, now: NOW });
  assert.equal(led.skipped, 1);
  assert.equal(led.recorded, 0);
  assert.equal(led.attempted, 3, "the fetch still happened and is reported");
  delete process.env.MOCK_TIER;
});

test("business tier records the rows, and reports unmapped even on a green run", async () => {
  // A feed of 500 records of which 12 map is a broken integration wearing a
  // tick. The count has to survive into the ledger.
  freshStore();
  process.env.MOCK_TIER = "business";
  const src = new StubSource([batch(2, 7)]);
  const led = await runArdaSync({ workspaces: WS, source: src, now: NOW });
  assert.equal(led.status, "ok");
  assert.equal(led.recorded, 2);
  assert.equal(led.unmapped, 7);
  assert.equal(led.skipped, 0);
  delete process.env.MOCK_TIER;
});

test("the job inserts and does nothing else - no scoring, no resolution, no promotion", async () => {
  // ADR-010 rule 4, asserted rather than trusted. It is also what keeps the
  // kill criterion honest: promotion must stay a human verdict.
  const store = freshStore();
  process.env.MOCK_TIER = "business";
  const touched: string[] = [];
  for (const m of ["resolveSignal", "createLead", "scoreSignal", "promoteSignal"] as const) {
    const orig = (store as unknown as Record<string, unknown>)[m];
    if (typeof orig === "function") {
      (store as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => {
        touched.push(m);
        return (orig as (...a: unknown[]) => unknown).apply(store, args);
      };
    }
  }

  await runArdaSync({ workspaces: WS, source: new StubSource([batch(2)]), now: NOW });
  assert.deepEqual(touched, [], `the job touched ${touched.join(", ")}`);

  // Rows land at the DDL default status.
  const rows = await store.listSignals("ws_1", {});
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.status === "new"), "nothing was scored or promoted");
  assert.ok(rows.every((r) => r.accountId === null), "nothing was resolved to an account");
  delete process.env.MOCK_TIER;
});

test("running twice is idempotent: the second pass is duplicates, not errors", async () => {
  freshStore();
  process.env.MOCK_TIER = "business";
  const src = new StubSource([batch(3), batch(3)]);
  const first = await runArdaSync({ workspaces: WS, source: src, now: NOW });
  const second = await runArdaSync({ workspaces: WS, source: src, now: NOW });
  assert.equal(first.recorded, 3);
  assert.equal(second.recorded, 0);
  assert.equal(second.duplicates, 3);
  assert.equal(second.status, "ok", "a feed replaying its own records is normal traffic");
  delete process.env.MOCK_TIER;
});

test("the watermark is derived from stored rows and re-polled with an overlap", async () => {
  // The reason ADR-011 needs no cursor table. Overlap is cheaper than a gap: a
  // duplicate is caught by the unique index, a missed record is invisible.
  freshStore();
  process.env.MOCK_TIER = "business";
  const src = new StubSource([batch(1), batch(0)]);
  await runArdaSync({ workspaces: WS, source: src, now: NOW });
  await runArdaSync({ workspaces: WS, source: src, now: NOW });

  const overlapMs = getArdaConfig({}).overlapHours * 3_600_000;
  const detected = new Date("2026-08-14T00:00:00Z").getTime();
  assert.equal(src.calls[1].since.getTime(), detected - overlapMs);
  assert.ok(src.calls[1].since.getTime() < detected, "the window overlaps rather than abuts");
  delete process.env.MOCK_TIER;
});

test("a source that throws is counted as failed and reported non-ok, not as a quiet feed", async () => {
  freshStore();
  process.env.MOCK_TIER = "business";
  const boom: ArdaFactSource = {
    configured: true,
    fetchSignals: async () => {
      throw new Error("upstream down");
    },
  };
  const led = await runArdaSync({ workspaces: WS, source: boom, now: NOW });
  assert.equal(led.status, "failed");
  assert.equal(led.failed, 1);
  assert.equal(led.recorded, 0);
  delete process.env.MOCK_TIER;
});

test("getArdaFactSource takes no argument, so it cannot serve one caller's env to the next", () => {
  // The direct anti-regression for the discarded karda module, whose
  // getKnowledgePlane(env) memoised unkeyed: every caller after the first got
  // the FIRST caller's environment, and a test passing a stub env was served
  // the production plane while reporting a pass.
  assert.equal(getArdaFactSource.length, 0);
  setArdaFactSource(null);
  const a = getArdaFactSource();
  assert.equal(a, getArdaFactSource(), "memoised");
  setArdaFactSource(null);
  assert.notEqual(a, getArdaFactSource(), "and the memo is resettable");
  setArdaFactSource(null);
});

test("arda is not configured by default, so nothing changes for an existing workspace", () => {
  assert.equal(getArdaConfig({}).enabled, false);
  assert.equal(getArdaConfig({ ARDA_BASE_URL: "" }).enabled, false);
  assert.equal(getArdaConfig({ ARDA_BASE_URL: "https://a.invalid" }).enabled, true);
  // No default host: a data plane that guessed its own address could pull a
  // workspace's signals from somewhere nobody chose.
  assert.equal(getArdaConfig({}).baseUrl, "");
});

test("the signal store is left as found", () => {
  setSignalStore(null);
  assert.ok(getSignalStore());
});
