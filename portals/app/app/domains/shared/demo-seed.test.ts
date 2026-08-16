import { test } from "node:test";
import assert from "node:assert/strict";
import { seedDemoWorkspace, type DemoStores } from "./demo-seed";
import { demoDataEnabled, ensureDemoData, resetDemoSeed, setPipelineStore } from "./registry";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryDeliveryStore } from "../delivery/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryPlanningStore } from "../planning/store";
import { InMemorySignalStore } from "../signal/store";
import { InMemoryStrategyStore } from "../strategy/store";
import { rollUp } from "../pipeline/lib/forecast";
import { deriveProjectHealth } from "../delivery/lib/revenue";
import { analyzeChain } from "../account/lib/health";

const WS = "ws_demo";

function stores(): DemoStores {
  return {
    strategy: new InMemoryStrategyStore(),
    planning: new InMemoryPlanningStore(),
    account: new InMemoryAccountStore(),
    signal: new InMemorySignalStore(),
    pipeline: new InMemoryPipelineStore(),
    delivery: new InMemoryDeliveryStore(),
    copilot: new InMemoryCopilotStore(),
  };
}

// --- The safety guards, which matter more than the data -------------------

test("demo data is OFF unless explicitly switched on", () => {
  // Absent means off. A default-on demo mode is how fixtures reach production.
  assert.equal(demoDataEnabled({}), false);
  assert.equal(demoDataEnabled({ YUCER_DEMO_DATA: "true" }), false, "only the literal 'on' counts");
  assert.equal(demoDataEnabled({ YUCER_DEMO_DATA: "on" }), true);
});

test("demo data never applies when a database is configured", () => {
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://localhost/real";
  try {
    assert.equal(
      demoDataEnabled({ YUCER_DEMO_DATA: "on" }),
      false,
      "a workspace with a real database must never be seeded",
    );
  } finally {
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
});

test("ensureDemoData is a no-op when the switch is off", () => {
  resetDemoSeed();
  setPipelineStore(null);
  const saved = process.env.YUCER_DEMO_DATA;
  delete process.env.YUCER_DEMO_DATA;
  try {
    assert.equal(ensureDemoData(WS), false);
  } finally {
    if (saved !== undefined) process.env.YUCER_DEMO_DATA = saved;
    resetDemoSeed();
  }
});

test("seeding twice does not multiply the fixtures", async () => {
  const saved = process.env.YUCER_DEMO_DATA;
  const savedDb = process.env.DATABASE_URL;
  process.env.YUCER_DEMO_DATA = "on";
  delete process.env.DATABASE_URL;
  resetDemoSeed();
  setPipelineStore(null);
  try {
    assert.equal(ensureDemoData(WS), true);
    assert.equal(ensureDemoData(WS), true, "second call still reports enabled");
    // A page render calls this every time; multiplying rows would show up as
    // duplicated opportunities within a few navigations.
    const { getPipelineStore } = await import("./registry");
    const rows = await getPipelineStore().listOpportunities(WS, { includeClosed: true });
    assert.equal(rows.length, 4);
  } finally {
    if (saved !== undefined) process.env.YUCER_DEMO_DATA = saved;
    else delete process.env.YUCER_DEMO_DATA;
    if (savedDb !== undefined) process.env.DATABASE_URL = savedDb;
    resetDemoSeed();
    setPipelineStore(null);
  }
});

// --- The chain is real, not a set of agreeing fixtures --------------------

test("the campaign's attributed opportunities are the same ids the pipeline holds", async () => {
  // If these drifted, campaignReturn() would compute a number from fixtures
  // that agree with themselves by coincidence rather than from a real join.
  const s = stores();
  seedDemoWorkspace(WS, s);

  const attributed = await s.strategy.attributedOpportunities(WS, "camp_demo_1");
  const pipeline = await s.pipeline.listOpportunities(WS, { includeClosed: true });
  const pipelineIds = new Set(pipeline.map((o) => o.id));

  assert.ok(attributed.length > 0);
  for (const a of attributed) {
    assert.ok(pipelineIds.has(a.id), `${a.id} is attributed to a campaign but not in the pipeline`);
  }
});

test("the lead points at the signal and opportunity that actually exist", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);

  const leads = await s.signal.listLeads(WS);
  const converted = leads.find((l) => l.status === "converted");
  assert.ok(converted, "the demo must include one completed conversion");

  assert.ok(await s.signal.getSignal(WS, converted.signalId!), "lead points at a real signal");
  const opp = await s.pipeline.getOpportunity(WS, converted.convertedOpportunityId!);
  assert.ok(opp, "lead points at a real opportunity");
  assert.equal(opp.campaignId, converted.campaignId, "the campaign was copied across the seam");
});

test("the delivery project demonstrates the overdue-forbids-green rule", async () => {
  // Reported green with an overdue instalment. If the fixture were clean, the
  // page would assert the rule without ever showing it.
  const s = stores();
  seedDemoWorkspace(WS, s);

  const project = await s.delivery.getProject(WS, "prj_demo_1");
  assert.equal(project?.health, "green", "the team reported green");

  const [instalments, milestones] = await Promise.all([
    s.delivery.listInstalments(WS, "prj_demo_1"),
    s.delivery.listMilestones(WS, "prj_demo_1"),
  ]);
  const derived = deriveProjectHealth({ reported: "green", instalments, milestones });
  assert.ok(derived.ok);
  assert.equal(derived.value.health, "amber", "the rule downgrades it");
});

test("the forecast roll-up computes from the seeded deals", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);
  const rows = await s.pipeline.listOpportunities(WS, { includeClosed: true });
  const totals = rollUp(rows, "CNY");
  assert.ok(totals.ok);
  assert.ok(totals.value.commitAmount.amount > 0, "there is something to commit");
  assert.ok(totals.value.closedAmount.amount > 0, "and something already closed");
});

test("the decision chain is complete and the buyer is reachable", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);
  const [contacts, relations] = await Promise.all([
    s.account.listContacts(WS, "acc_demo_1"),
    s.account.listRelations(WS, "acc_demo_1"),
  ]);
  const chain = analyzeChain(contacts, relations);

  assert.deepEqual(chain.missing, [], "economic, technical and coach are all covered");
  assert.equal(chain.blockers.length, 1, "and there is a blocker to show");
  assert.equal(chain.economicBuyerUnreachable, false, "a coach can reach the buyer");
});

test("the inbox contains an unmatched signal, which is the new-logo case", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);
  const signals = await s.signal.listSignals(WS);
  assert.ok(
    signals.some((x) => x.accountId == null && (x.score ?? 0) > 50),
    "a high-scoring signal with no account match must be present - it is what the rule is for",
  );
});

test("planning has a target with no snapshot, so the two null cases are visible", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);
  const targets = await s.planning.listTargets(WS, { period: "2026Q3" });
  const withoutSnapshot: string[] = [];
  for (const t of targets) {
    if ((await s.planning.closedAmountFor(WS, t)) == null) withoutSnapshot.push(t.id);
  }
  assert.ok(withoutSnapshot.length > 0, "one scope must be unforecast, to distinguish it from 0%");
  assert.ok(withoutSnapshot.length < targets.length, "and others must have snapshots");
});

test("the proposal queue has pending items and one already decided", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);
  const proposals = await s.copilot.listProposals(WS);
  assert.ok(proposals.filter((p) => p.status === "proposed").length >= 2);
  assert.ok(proposals.some((p) => p.decidedBySub != null), "history is visible too");
});
