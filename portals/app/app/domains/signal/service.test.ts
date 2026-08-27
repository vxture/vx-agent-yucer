import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { ROLE_CODES, permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { ACTIONS } from "../../authz/actions";
import { unwrap } from "../shared/result";
import { InMemorySignalStore, type LeadRecord, type SignalRecord } from "./store";
import {
  advanceLead,
  completeConversion,
  convertLead,
  ingestSignals,
  listSignals,
  previewAttribution,
  promoteSignal,
  rescoreSignal,
  triageSignal,
  type SignalContext,
} from "./service";

const WS = "ws_1";
const NOW = new Date("2026-08-15T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function signal(over: Partial<SignalRecord> = {}): SignalRecord {
  return {
    id: "sig_1",
    workspaceId: WS,
    source: "web",
    sourceRef: "https://news/1",
    signalType: "intent",
    subject: "Acme is evaluating CRM replacements",
    payload: {},
    detectedAt: daysAgo(3),
    accountId: null,
    targeting: null,
    score: null,
    status: "new",
    ...over,
  };
}

function lead(over: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead_1",
    workspaceId: WS,
    leadNo: "LEAD-00001",
    companyName: "Acme",
    contactName: null,
    accountId: "acc_1",
    signalId: "sig_1",
    campaignId: null,
    score: 78,
    ownerSub: "usr_rep",
    status: "qualified",
    convertedOpportunityId: null,
    ...over,
  };
}

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemorySignalStore()): SignalContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

// --- Rule 1: a stranger's signal is the point ------------------------------

test("an unmatched account does not zero the score", async () => {
  // A scorer that zeroes strangers has become a CRM report. The new-logo signal
  // is the most valuable thing this domain surfaces.
  const store = new InMemorySignalStore();
  store.seed({ signals: [signal({ accountId: null })] });
  const out = unwrap(await rescoreSignal(ctx("sales_rep", "pro", store), "sig_1", { now: NOW }));

  assert.ok(out.signal.score! > 0);
  assert.equal(out.breakdown.matchBonus, 0);
});

test("the breakdown is returned so a low score can be argued with", async () => {
  const store = new InMemorySignalStore();
  store.seed({ signals: [signal({ signalType: "hiring", detectedAt: daysAgo(120) })] });
  const out = unwrap(await rescoreSignal(ctx("sales_rep", "pro", store), "sig_1", { now: NOW }));

  assert.ok(out.breakdown.baseWeight > 0);
  assert.ok(out.breakdown.decayMultiplier < 1, "an old signal decayed");
  assert.equal(out.breakdown.score, out.signal.score);
});

test("scoring moves a new signal to scored", async () => {
  const store = new InMemorySignalStore();
  store.seed({ signals: [signal()] });
  const out = unwrap(await rescoreSignal(ctx("sales_rep", "pro", store), "sig_1", { now: NOW }));
  assert.equal(out.signal.status, "scored");
});

test("auto-scoring is a pro capability; hand triage is not", async () => {
  const store = new InMemorySignalStore();
  store.seed({ signals: [signal()] });
  const r = await rescoreSignal(ctx("sales_rep", "starter", store), "sig_1", { now: NOW });
  assert.equal(r.ok === false && r.violations[0].code, "feature_not_in_tier");
  // Dismissing by hand still works on starter.
  assert.ok((await triageSignal(ctx("sales_rep", "starter", store), "sig_1", "dismissed")).ok);
});

// --- Rule 2: evidence is frozen --------------------------------------------

test("the store has no way to rewrite evidence", async () => {
  // resolveSignal accepts accountId, score and status - nothing else. This is
  // the type system carrying the rule; the column locks are the backstop.
  const store = new InMemorySignalStore();
  store.seed({ signals: [signal()] });
  await store.resolveSignal(WS, "sig_1", { score: 50, status: "scored" });
  const after = await store.getSignal(WS, "sig_1");
  assert.equal(after?.source, "web");
  assert.equal(after?.subject, "Acme is evaluating CRM replacements");
});

// --- Ingestion and dedup ----------------------------------------------------

test("ingestion is business-tier and reports duplicates rather than failing", async () => {
  const store = new InMemorySignalStore();
  // sales_rep, not sales_ops. Ingestion now rides signal.triage rather than
  // admin.manage, which also repairs an incoherence: sales_ops holds
  // admin.manage but NOT signal.read, so under the old gate the only role that
  // could ingest signals was one that could not then read them.
  const c = ctx("sales_rep", "business", store);
  const incoming = [
    { source: "news", sourceRef: "n1", signalType: "funding" as const, subject: "Acme raised a round" },
    { source: "news", sourceRef: "n1", signalType: "funding" as const, subject: "Acme raised a round" },
  ];
  const out = unwrap(await ingestSignals(c, incoming));

  assert.equal(out.recorded.length, 1, "the same external record enters once");
  assert.equal(out.duplicates, 1, "and the replay is counted, not hidden");
});

test("ingestion below business tier is refused", async () => {
  const r = await ingestSignals(ctx("sales_rep", "pro"), [
    { source: "news", sourceRef: "n1", signalType: "funding", subject: "x" },
  ]);
  assert.equal(r.ok === false && r.violations[0].code, "feature_not_in_tier");
});

test("an ingested signal is always born `new`", async () => {
  const store = new InMemorySignalStore();
  const out = unwrap(
    await ingestSignals(ctx("sales_rep", "business", store), [
      { source: "web", sourceRef: "w1", signalType: "intent", subject: "x" },
    ]),
  );
  assert.equal(out.recorded[0].status, "new");
  assert.equal(out.recorded[0].score, null);
});

// --- Promotion --------------------------------------------------------------

test("promotion requires a score", async () => {
  const store = new InMemorySignalStore();
  store.seed({ signals: [signal({ status: "scored", score: null })] });
  const r = await promoteSignal(ctx("sales_rep", "pro", store), "sig_1");
  assert.equal(r.ok === false && r.violations[0].code, "score_required");
});

test("promotion creates the lead and marks the signal promoted", async () => {
  const store = new InMemorySignalStore();
  store.seed({ signals: [signal({ status: "scored", score: 82, accountId: "acc_1" })] });
  const out = unwrap(await promoteSignal(ctx("sales_rep", "pro", store), "sig_1"));

  assert.equal(out.signal.status, "promoted");
  assert.equal(out.lead.signalId, "sig_1");
  assert.equal(out.lead.score, 82);
  assert.equal(out.lead.accountId, "acc_1");
  assert.equal(out.lead.status, "new");
});

test("a campaign-sourced signal passes its campaign to the lead; others do not", async () => {
  const store = new InMemorySignalStore();
  store.seed({
    signals: [signal({ id: "sig_1", status: "scored", score: 80, source: "campaign", sourceRef: "camp_7" })],
  });
  const withCampaign = unwrap(await promoteSignal(ctx("sales_rep", "pro", store), "sig_1"));
  assert.equal(withCampaign.lead.campaignId, "camp_7");

  const store2 = new InMemorySignalStore();
  store2.seed({ signals: [signal({ status: "scored", score: 80, source: "web", sourceRef: "w1" })] });
  const without = unwrap(await promoteSignal(ctx("sales_rep", "pro", store2), "sig_1"));
  assert.equal(without.lead.campaignId, null, "no lineage must not be invented");
});

// --- Conversion: the seam of the attribution chain --------------------------

test("only a qualified lead converts", async () => {
  const store = new InMemorySignalStore();
  store.seed({ leads: [lead({ status: "working" })] });
  const r = await convertLead(ctx("sales_rep", "pro", store), "lead_1");
  assert.equal(r.ok === false && r.violations[0].code, "lead_not_qualified");
});

test("conversion copies the campaign onto the opportunity", async () => {
  const store = new InMemorySignalStore();
  store.seed({ leads: [lead({ campaignId: "camp_1" })] });
  const out = unwrap(await convertLead(ctx("sales_rep", "pro", store), "lead_1"));

  assert.equal(out.opportunity.campaignId, "camp_1");
  assert.equal(out.attribution.source, "campaign");
});

test("conversion falls back to the signal's campaign lineage", async () => {
  const store = new InMemorySignalStore();
  store.seed({
    leads: [lead({ campaignId: null, signalId: "sig_1" })],
    signals: [signal({ id: "sig_1", source: "campaign", sourceRef: "camp_9" })],
  });
  const out = unwrap(await convertLead(ctx("sales_rep", "pro", store), "lead_1"));
  assert.equal(out.attribution.source, "signal_campaign");
  assert.equal(out.opportunity.campaignId, "camp_9");
});

test("a lead with no lineage converts as self-sourced", async () => {
  const store = new InMemorySignalStore();
  store.seed({ leads: [lead({ campaignId: null, signalId: null })] });
  const out = unwrap(await convertLead(ctx("sales_rep", "pro", store), "lead_1"));
  assert.equal(out.attribution.source, "self_sourced");
  assert.equal(out.opportunity.campaignId, null);
});

test("conversion needs an account, and the loop closes on completeConversion", async () => {
  const store = new InMemorySignalStore();
  store.seed({ leads: [lead({ accountId: null })] });
  const c = ctx("sales_rep", "pro", store);

  const noAccount = await convertLead(c, "lead_1");
  assert.equal(noAccount.ok === false && noAccount.violations[0].code, "account_required");

  assert.ok((await convertLead(c, "lead_1", { accountId: "acc_9" })).ok);
  unwrap(await completeConversion(c, "lead_1", "opp_new"));

  const after = await store.getLead(WS, "lead_1");
  assert.equal(after?.status, "converted");
  assert.equal(after?.convertedOpportunityId, "opp_new");
});

test("a converted lead is final", async () => {
  const store = new InMemorySignalStore();
  store.seed({ leads: [lead({ status: "converted", convertedOpportunityId: "opp_1" })] });
  const r = await advanceLead(ctx("sales_rep", "pro", store), "lead_1", "working");
  assert.equal(r.ok === false && r.violations[0].code, "lead_converted");
});

test("converting is gated as a pipeline write - the receiving side owns the seam", async () => {
  // marketing_manager triages signals but does not create opportunities.
  const store = new InMemorySignalStore();
  store.seed({ leads: [lead()] });
  const r = await convertLead(ctx("marketing_manager", "pro", store), "lead_1");
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("attribution can be previewed without writing anything", async () => {
  const store = new InMemorySignalStore();
  store.seed({ leads: [lead({ campaignId: "camp_1" })] });
  const a = unwrap(await previewAttribution(ctx("viewer", "pro", store), "lead_1"));
  assert.equal(a.campaignId, "camp_1");
  assert.equal((await store.getLead(WS, "lead_1"))?.status, "qualified", "nothing moved");
});

// --- Isolation and ordering -------------------------------------------------

test("signals never cross a workspace boundary", async () => {
  const store = new InMemorySignalStore();
  store.seed({ signals: [signal({ id: "mine" }), signal({ id: "theirs", workspaceId: "ws_other" })] });
  const rows = unwrap(await listSignals(ctx("sales_rep", "pro", store)));
  assert.deepEqual(rows.map((r) => r.id), ["mine"]);
});

test("the inbox puts the best signal at the top", async () => {
  const store = new InMemorySignalStore();
  store.seed({
    signals: [
      signal({ id: "low", score: 20 }),
      signal({ id: "high", score: 90 }),
      signal({ id: "unscored", score: null }),
    ],
  });
  const rows = unwrap(await listSignals(ctx("sales_rep", "pro", store)));
  assert.deepEqual(rows.map((r) => r.id), ["high", "low", "unscored"]);
});

test("whoever can write a signal into the inbox can also read it", async () => {
  // The incoherence the ingest gate change repaired. Under the old gate,
  // ingestion rode signal.feed.configure -> admin.manage, and the role that
  // actually holds admin.manage (sales_ops) has no signal.read at all: the only
  // role able to fill the inbox could not open it.
  //
  // Asserted as a property over the whole catalogue rather than about one role,
  // so a future grant that re-splits them fails here instead of in production.
  for (const role of ROLE_CODES) {
    const held = new Set(permissionsForRoles([role]));
    if (held.has(ACTIONS["signal.feed.ingest"].permission)) {
      assert.ok(held.has("signal.read"), `${role} can ingest signals but cannot read them`);
    }
  }
});
