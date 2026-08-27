import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../authz/catalog";
import { money } from "./shared/money";
import { unwrap } from "./shared/result";
import { InMemorySignalStore, type LeadRecord, type SignalRecord } from "./signal/store";
import { InMemoryPipelineStore } from "./pipeline/store";
import { convertLeadToOpportunity, type ConversionContext } from "./conversion";

const WS = "ws_1";

function lead(over: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead_1",
    workspaceId: WS,
    leadNo: "LEAD-00001",
    companyName: "Acme Retail",
    contactName: "Liu Min",
    accountId: "acc_1",
    signalId: "sig_1",
    campaignId: "camp_1",
    score: 82,
    ownerSub: "usr_rep",
    status: "qualified",
    convertedOpportunityId: null,
    ...over,
  };
}

function signal(over: Partial<SignalRecord> = {}): SignalRecord {
  return {
    id: "sig_1",
    workspaceId: WS,
    source: "campaign",
    sourceRef: "camp_9",
    signalType: "intent",
    subject: "Acme evaluating POS",
    payload: {},
    detectedAt: new Date("2026-07-01T00:00:00Z"),
    accountId: "acc_1",
    targeting: null,
    score: 82,
    status: "promoted",
    ...over,
  };
}

function ctx(
  role: RoleCode,
  tier: Entitlement["tier"],
  signalStore = new InMemorySignalStore(),
  pipelineStore = new InMemoryPipelineStore(),
): ConversionContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    signalStore,
    pipelineStore,
  };
}

// --- The seam ---------------------------------------------------------------

test("conversion copies the campaign onto the opportunity and freezes it", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead({ campaignId: "camp_1" })], signals: [signal()] });

  const out = unwrap(
    await convertLeadToOpportunity(ctx("sales_rep", "pro", signals, pipeline), { leadId: "lead_1" }),
  );

  assert.equal(out.opportunity.campaignId, "camp_1");
  assert.equal(out.attribution.source, "campaign");

  // Both sides now hold the same frozen value.
  const stored = await pipeline.getOpportunity(WS, out.opportunity.id);
  assert.equal(stored?.campaignId, "camp_1");
});

test("a lead with no campaign inherits the signal's lineage", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({
    leads: [lead({ campaignId: null, signalId: "sig_1" })],
    signals: [signal({ source: "campaign", sourceRef: "camp_9" })],
  });

  const out = unwrap(
    await convertLeadToOpportunity(ctx("sales_rep", "pro", signals, pipeline), { leadId: "lead_1" }),
  );
  assert.equal(out.attribution.source, "signal_campaign");
  assert.equal(out.opportunity.campaignId, "camp_9");
});

test("no lineage converts as self-sourced rather than inventing one", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead({ campaignId: null, signalId: null })] });

  const out = unwrap(
    await convertLeadToOpportunity(ctx("sales_rep", "pro", signals, pipeline), { leadId: "lead_1" }),
  );
  assert.equal(out.attribution.source, "self_sourced");
  assert.equal(out.opportunity.campaignId, null);
});

test("the loop closes: the lead points at the opportunity that exists", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead()], signals: [signal()] });

  const out = unwrap(
    await convertLeadToOpportunity(ctx("sales_rep", "pro", signals, pipeline), { leadId: "lead_1" }),
  );

  const after = await signals.getLead(WS, "lead_1");
  assert.equal(after?.status, "converted");
  assert.equal(after?.convertedOpportunityId, out.opportunity.id);
  assert.ok(await pipeline.getOpportunity(WS, out.opportunity.id));
});

// --- The opportunity is born correctly -------------------------------------

test("a converted deal starts at qualify with the stage default probability", async () => {
  // A deal cannot be born mid-funnel: the stage machine moves it, and every
  // move is journalled.
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead()], signals: [signal()] });

  const out = unwrap(
    await convertLeadToOpportunity(ctx("sales_rep", "pro", signals, pipeline), { leadId: "lead_1" }),
  );
  assert.equal(out.opportunity.stage, "qualify");
  assert.equal(out.opportunity.probability, 10);
  assert.equal(out.opportunity.forecastCategory, "pipeline");
  assert.equal(out.opportunity.status, "open");
});

test("the lead's owner follows the deal", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead({ ownerSub: "usr_rep" })], signals: [signal()] });

  const out = unwrap(
    await convertLeadToOpportunity(ctx("sales_leader", "pro", signals, pipeline), { leadId: "lead_1" }),
  );
  assert.equal(out.opportunity.ownerSub, "usr_rep", "not the converter");
});

test("the name defaults to the company and can be overridden", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead()], signals: [signal()] });
  const c = ctx("sales_rep", "pro", signals, pipeline);

  const out = unwrap(await convertLeadToOpportunity(c, { leadId: "lead_1", name: "  POS rollout  " }));
  assert.equal(out.opportunity.name, "POS rollout");

  const signals2 = new InMemorySignalStore();
  signals2.seed({ leads: [lead({ id: "lead_2" })], signals: [signal()] });
  const out2 = unwrap(
    await convertLeadToOpportunity(
      ctx("sales_rep", "pro", signals2, new InMemoryPipelineStore()),
      { leadId: "lead_2" },
    ),
  );
  assert.equal(out2.opportunity.name, "Acme Retail");
});

test("an amount and expected close carry across", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead()], signals: [signal()] });
  const close = new Date("2026-12-31T00:00:00Z");

  const out = unwrap(
    await convertLeadToOpportunity(ctx("sales_rep", "pro", signals, pipeline), {
      leadId: "lead_1",
      amount: money(1_200_000),
      expectedCloseAt: close,
    }),
  );
  assert.equal(out.opportunity.amount?.amount, 1_200_000);
  assert.equal(out.opportunity.expectedCloseAt, close);
});

// --- Refusals ---------------------------------------------------------------

test("nothing is created when the rules refuse", async () => {
  // Ordering matters: gates and rules run before any write, so a refused
  // conversion leaves no orphan.
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead({ status: "working" })] });

  const r = await convertLeadToOpportunity(ctx("sales_rep", "pro", signals, pipeline), { leadId: "lead_1" });
  assert.equal(r.ok === false && r.violations[0].code, "lead_not_qualified");
  assert.equal((await pipeline.listOpportunities(WS, { includeClosed: true })).length, 0);
});

test("nothing is created when the gate refuses", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead()], signals: [signal()] });

  // marketing_manager triages signals but does not create deals.
  const r = await convertLeadToOpportunity(
    ctx("marketing_manager", "pro", signals, pipeline),
    { leadId: "lead_1" },
  );
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
  assert.equal((await pipeline.listOpportunities(WS, { includeClosed: true })).length, 0);
});

test("an unmatched lead needs an account supplied", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead({ accountId: null })] });
  const c = ctx("sales_rep", "pro", signals, pipeline);

  const without = await convertLeadToOpportunity(c, { leadId: "lead_1" });
  assert.equal(without.ok === false && without.violations[0].code, "account_required");

  const out = unwrap(await convertLeadToOpportunity(c, { leadId: "lead_1", accountId: "acc_new" }));
  assert.equal(out.opportunity.accountId, "acc_new");
});

test("a lead in another workspace is not found", async () => {
  const signals = new InMemorySignalStore();
  signals.seed({ leads: [lead({ workspaceId: "ws_other" })] });
  const r = await convertLeadToOpportunity(
    ctx("sales_rep", "pro", signals, new InMemoryPipelineStore()),
    { leadId: "lead_1" },
  );
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

test("converting twice is refused - one piece of demand, one deal", async () => {
  const signals = new InMemorySignalStore();
  const pipeline = new InMemoryPipelineStore();
  signals.seed({ leads: [lead()], signals: [signal()] });
  const c = ctx("sales_rep", "pro", signals, pipeline);

  unwrap(await convertLeadToOpportunity(c, { leadId: "lead_1" }));
  const second = await convertLeadToOpportunity(c, { leadId: "lead_1" });

  assert.equal(second.ok === false && second.violations[0].code, "lead_not_qualified");
  assert.equal(
    (await pipeline.listOpportunities(WS, { includeClosed: true })).length,
    1,
    "one piece of demand must not become two deals",
  );
});
