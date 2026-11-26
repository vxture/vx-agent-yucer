import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { matchSignalAccount, promoteSignal, registerSignal, rescoreSignal, type SignalContext } from "./service";
import type { NewSignal } from "./store";

// PrismaSignalStore, against a real Postgres.
//
// The one thing that cannot be tested against the in-memory mirror at all:
// recordSignal()'s duplicate handling. It has to distinguish the ORDINARY
// case (a feed replaying itself, caught by uidx_signal_ws_source_ref) from a
// genuine failure (a bad signal_type, a missing account) - the in-memory
// store has no unique index to collide on, so this distinction has never
// actually been exercised. createLead()'s advisory-lock lead_no allocation
// is the other real-database concern, same shape as pipeline's opportunity_no.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000008";
const ACC = "eeeeeeee-0000-0000-0000-0000000000f1";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function seed(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-SIG', 'Signal Test', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM yucer_pipeline.funnel_exit WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_pipeline.lead WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_pipeline.signal WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaSignalStore } = await import("./prisma-store");
  return new PrismaSignalStore();
}

function newSignal(overrides: Partial<NewSignal> = {}): NewSignal {
  return {
    source: "web",
    sourceRef: "ref-1",
    signalType: "intent",
    subject: "Renewed interest",
    ...overrides,
  };
}

// --- recordSignal -----------------------------------------------------------------

test("recordSignal returns null on a source/source_ref collision instead of throwing", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const first = await s.recordSignal(WS, newSignal());
    assert.ok(first);
    const second = await s.recordSignal(WS, newSignal({ subject: "Replayed" }));
    assert.equal(second, null, "a feed replaying its own record is ordinary, not an error");

    const list = await s.listSignals(WS);
    assert.equal(list.length, 1, "the duplicate must not have been written");
  } finally {
    await cleanup();
  }
});

test("recordSignal defaults status to new and lets a genuine constraint violation throw", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.recordSignal(WS, newSignal());
    assert.equal(created?.status, "new");

    await assert.rejects(
      () => s.recordSignal(WS, newSignal({ sourceRef: "ref-bad", signalType: "not_a_real_type" as never })),
      /chk_signal_type/,
      "an invalid signal_type must surface as a real error, not a swallowed duplicate",
    );
  } finally {
    await cleanup();
  }
});

test("a signal score outside 0-100 is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO yucer_pipeline.signal (workspace_id, source, source_ref, signal_type, subject, score)
             VALUES ($1, 'web', 'ref-score', 'intent', 'x', 150)`,
            [WS],
          ),
        ),
      /chk_signal_score/,
    );
  } finally {
    await cleanup();
  }
});

// --- listSignals / getSignal --------------------------------------------------------

test("listSignals orders by score desc with unscored last, then by detected_at", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.recordSignal(WS, newSignal({ sourceRef: "r1", subject: "Unscored" }));
    await s.recordSignal(WS, newSignal({ sourceRef: "r2", subject: "Scored 90" }));
    await s.recordSignal(WS, newSignal({ sourceRef: "r3", subject: "Scored 40" }));
    await withPg((c) => c.query(`UPDATE yucer_pipeline.signal SET score = 90 WHERE workspace_id = $1 AND source_ref = 'r2'`, [WS]));
    await withPg((c) => c.query(`UPDATE yucer_pipeline.signal SET score = 40 WHERE workspace_id = $1 AND source_ref = 'r3'`, [WS]));

    const list = await s.listSignals(WS);
    assert.deepEqual(list.map((sig) => sig.subject), ["Scored 90", "Scored 40", "Unscored"]);
  } finally {
    await cleanup();
  }
});

test("listSignals filters by minScore, status, signalType and accountId", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    await s.recordSignal(WS, newSignal({ sourceRef: "r1", signalType: "hiring", accountId: ACC }));
    await s.recordSignal(WS, newSignal({ sourceRef: "r2", signalType: "intent" }));
    await withPg((c) => c.query(`UPDATE yucer_pipeline.signal SET score = 80 WHERE workspace_id = $1 AND source_ref = 'r1'`, [WS]));

    assert.deepEqual((await s.listSignals(WS, { minScore: 50 })).map((r) => r.sourceRef), ["r1"]);
    assert.deepEqual((await s.listSignals(WS, { signalType: "hiring" })).map((r) => r.sourceRef), ["r1"]);
    assert.deepEqual((await s.listSignals(WS, { accountId: ACC })).map((r) => r.sourceRef), ["r1"]);
  } finally {
    await cleanup();
  }
});

test("getSignal scopes by workspace and returns null across workspaces", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.recordSignal(WS, newSignal());
    assert.ok(created);
    assert.equal(await s.getSignal("eeeeeeee-0000-0000-0000-0000000000ff", created!.id), null);
  } finally {
    await cleanup();
  }
});

// --- resolveSignal ------------------------------------------------------------------

test("resolveSignal writes the resolution fields and leaves evidence untouched", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.recordSignal(WS, newSignal());
    assert.ok(created);
    const ok = await s.resolveSignal(WS, created!.id, { accountId: ACC, score: 75, status: "scored" });
    assert.equal(ok, true);
    const after = await s.getSignal(WS, created!.id);
    assert.equal(after?.accountId, ACC);
    assert.equal(after?.score, 75);
    assert.equal(after?.status, "scored");
    assert.equal(after?.subject, created!.subject, "evidence must be untouched");
  } finally {
    await cleanup();
  }
});

test("resolveSignal returns false when nothing matched", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ok = await s.resolveSignal(WS, "eeeeeeee-0000-0000-0000-0000000000ff", { status: "dismissed" });
    assert.equal(ok, false);
  } finally {
    await cleanup();
  }
});

test("manual registration, matching, scoring and promotion preserve evidence through the real store", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const ctx: SignalContext = {
      workspaceId: WS,
      sub: "usr_signal_test",
      holder: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
      entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" },
      store: s,
    };
    const registered = unwrap(await registerSignal(ctx, {
      requestId: "signal-service-resolution-test",
      subject: "Platform renewal discovery",
      signalType: "intent",
      companyName: "Signal Test",
      summary: "Confirm the platform integration scope and budget window.",
      detectedAt: "2026-08-01",
    }));
    const before = registered.signal!;
    assert.ok(before);
    const firstScore = unwrap(await rescoreSignal(ctx, before.id, { now: new Date("2026-08-02T00:00:00Z") }));
    assert.equal(firstScore.signal.status, "scored");
    assert.equal(firstScore.signal.accountId, null);
    assert.ok(firstScore.signal.score! > 0);
    assert.equal(unwrap(await matchSignalAccount(ctx, before.id, ACC)).accountId, ACC);
    const scored = unwrap(await rescoreSignal(ctx, before.id, { now: new Date("2026-08-02T00:00:00Z") }));
    assert.equal(scored.signal.status, "scored");
    assert.ok(scored.signal.score! > 0);
    const promoted = unwrap(await promoteSignal(ctx, before.id, { companyName: "Signal Test" }));
    assert.equal(promoted.lead.accountId, ACC);
    assert.equal(promoted.lead.signalId, before.id);
    assert.equal(promoted.lead.score, scored.signal.score);
    assert.equal(promoted.lead.companyName, "Signal Test");
    assert.equal(promoted.signal.status, "promoted");
    const after = (await s.getSignal(WS, before.id))!;
    for (const key of ["source", "sourceRef", "signalType", "subject", "payload", "detectedAt"] as const) {
      assert.deepEqual(after[key], before[key], `evidence ${key} must remain unchanged`);
    }
  } finally { await cleanup(); }
});

test("resolution snapshots cannot replace scope and each stale resolution field prevents a write", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = (await s.recordSignal(WS, newSignal({ payload: { summary: "Original event" } })))!;
    const expected = { ...created, subject: "Not a query field" };
    const otherWs = "eeeeeeee-0000-0000-0000-000000000009";
    const otherId = "eeeeeeee-0000-0000-0000-0000000000ff";
    assert.equal(await s.resolveSignal(otherWs, created.id, { score: 80 }, expected), false);
    assert.equal(await s.resolveSignal(WS, otherId, { score: 80 }, expected), false);
    assert.equal(await s.resolveSignal(WS, created.id, { score: 80, status: "scored" }, expected), true);
    assert.equal(await s.resolveSignal(WS, created.id, { status: "dismissed" }, expected), false);
    const current = (await s.getSignal(WS, created.id))!;
    for (const stale of [{ ...current, accountId: ACC }, { ...current, score: 79 }, { ...current, status: "new" as const }]) {
      assert.equal(await s.resolveSignal(WS, created.id, { status: "dismissed" }, stale), false);
    }
    const after = (await s.getSignal(WS, created.id))!;
    assert.equal(after.status, "scored");
    assert.equal(after.score, 80);
    assert.deepEqual(after.payload, created.payload);
  } finally { await cleanup(); }
});

// --- createLead / listLeads / getLead -------------------------------------------------

test("createLead allocates a sequential lead_no under the advisory lock", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const first = await s.createLead(WS, { companyName: "Acme", accountId: ACC, signalId: null, campaignId: null, score: 60 });
    const second = await s.createLead(WS, { companyName: "Beta", accountId: ACC, signalId: null, campaignId: null, score: 40 });
    assert.equal(first.leadNo, "LEAD-00001");
    assert.equal(second.leadNo, "LEAD-00002");
    assert.equal(first.status, "new");
  } finally {
    await cleanup();
  }
});

test("listLeads orders by score desc with unscored last, and filters by status/ownerSub", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    await s.createLead(WS, { companyName: "High", accountId: ACC, signalId: null, campaignId: null, score: 90, ownerSub: "usr_rep" });
    await s.createLead(WS, { companyName: "Low", accountId: ACC, signalId: null, campaignId: null, score: 30 });
    await s.createLead(WS, { companyName: "None", accountId: ACC, signalId: null, campaignId: null, score: null });

    const all = await s.listLeads(WS);
    assert.deepEqual(all.map((l) => l.companyName), ["High", "Low", "None"]);

    const byOwner = await s.listLeads(WS, { ownerSub: "usr_rep" });
    assert.deepEqual(byOwner.map((l) => l.companyName), ["High"]);
  } finally {
    await cleanup();
  }
});

test("getLead scopes by workspace", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createLead(WS, { companyName: "Acme", accountId: ACC, signalId: null, campaignId: null, score: null });
    assert.equal(await s.getLead("eeeeeeee-0000-0000-0000-0000000000ff", created.id), null);
    assert.ok(await s.getLead(WS, created.id));
  } finally {
    await cleanup();
  }
});

// --- updateLead ------------------------------------------------------------------

test("updateLead moves status and score but never the attribution keys", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createLead(WS, { companyName: "Acme", accountId: ACC, signalId: null, campaignId: null, score: 20 });
    const ok = await s.updateLead(WS, created.id, { status: "qualified", score: 85 });
    assert.equal(ok, true);
    const after = await s.getLead(WS, created.id);
    assert.equal(after?.status, "qualified");
    assert.equal(after?.score, 85);
    assert.equal(after?.signalId, created.signalId);
    assert.equal(after?.campaignId, created.campaignId);
  } finally {
    await cleanup();
  }
});

test("an unrecognised lead status is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createLead(WS, { companyName: "Acme", accountId: ACC, signalId: null, campaignId: null, score: null });
    await assert.rejects(() => s.updateLead(WS, created.id, { status: "bogus" as never }), /chk_lead_status/);
  } finally {
    await cleanup();
  }
});

test("updateLead returns false when nothing matched", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ok = await s.updateLead(WS, "eeeeeeee-0000-0000-0000-0000000000ff", { status: "working" });
    assert.equal(ok, false);
  } finally {
    await cleanup();
  }
});

test("concurrent signal promotions commit one lead and preserve original evidence", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const signal = (await s.recordSignal(WS, newSignal({ payload: { summary: "Original event" } })))!;
    await s.resolveSignal(WS, signal.id, { score: 80, status: "scored" });
    const lead = { companyName: "Acme", accountId: null, signalId: signal.id, campaignId: null, score: 80 };
    const results = await Promise.all(Array.from({ length: 4 }, () => s.promoteToLead(WS, signal.id, lead, { score: 80, accountId: null })));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await s.listLeads(WS)).length, 1);
    const after = (await s.getSignal(WS, signal.id))!;
    assert.equal(after.status, "promoted");
    assert.deepEqual(after.payload, signal.payload);
    assert.equal(after.sourceRef, signal.sourceRef);
  } finally { await cleanup(); }
});

test("a failed lead insert rolls back signal status and crossed workspaces cannot promote", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const signal = (await s.recordSignal(WS, newSignal()))!;
    await s.resolveSignal(WS, signal.id, { score: 80, status: "scored" });
    const lead = { companyName: "x".repeat(256), accountId: null, signalId: signal.id, campaignId: null, score: 80 };
    await assert.rejects(() => s.promoteToLead(WS, signal.id, lead, { score: 80, accountId: null }));
    assert.equal((await s.getSignal(WS, signal.id))?.status, "scored");
    assert.equal((await s.listLeads(WS)).length, 0);
    assert.equal(await s.promoteToLead("eeeeeeee-0000-0000-0000-000000000009", signal.id,
      { ...lead, companyName: "Acme" }, { score: 80, accountId: null }), null);
  } finally { await cleanup(); }
});

test("concurrent signal dismissals save one reason atomically", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const signal = (await s.recordSignal(WS, newSignal()))!;
    const exit = { stage: "signal" as const, subjectId: signal.id, outcome: "dismissed", reasonCode: "not_a_fit" as const,
      note: null, decidedBySub: "usr_signal_test" };
    const results = await Promise.all(Array.from({ length: 3 }, () => s.closeSignal(WS, signal.id, "new", "dismissed", exit)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await s.listFunnelExits(WS, signal.id)).length, 1);
  } finally { await cleanup(); }
});

test("lead numbering stays unique when an earlier lead was deleted", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const input = { companyName: "Acme", accountId: null, signalId: null, campaignId: null, score: null };
    const first = await s.createLead(WS, input);
    const second = await s.createLead(WS, input);
    await s.deleteLead(WS, first.id);
    const third = await s.createLead(WS, input);
    assert.equal(second.leadNo, "LEAD-00002");
    assert.equal(third.leadNo, "LEAD-00003");
  } finally { await cleanup(); }
});
