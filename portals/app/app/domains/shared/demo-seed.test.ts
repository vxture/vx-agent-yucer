import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unwrap } from "./result";
import {
  DEMO_NOW,
  DEMO_PRIOR_PERIOD,
  seedDemoWorkspace,
  type DemoStores,
} from "./demo-seed";
import { demoDataEnabled, ensureDemoData, resetDemoSeed, setPipelineStore } from "./registry";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryFieldStore } from "../account/field-store";
import { InMemoryCatalogStore } from "../catalog/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryDeliveryStore } from "../delivery/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryPlanningStore } from "../planning/store";
import { InMemorySignalStore } from "../signal/store";
import { InMemoryStrategyStore } from "../strategy/store";
import { rollUp } from "../pipeline/lib/forecast";
import { deriveProjectHealth } from "../delivery/lib/revenue";
import { analyzeChain, analyzeChainRecency } from "../account/lib/health";
import { reliability } from "../account/lib/commitment";
import { DEFAULT_PROPOSAL_TTL_MS } from "../copilot/lib/action";
import { isExecutable } from "../copilot/lib/autonomy";
import { OPEN_STAGE_ORDER, isStage, planStageChange } from "../pipeline/lib/stage";
import { coveringTerritories } from "../signal/lib/routing";
import { accountGaps, fillable } from "../account/lib/completeness";

const WS = "ws_demo";

function stores(): DemoStores {
  return {
    strategy: new InMemoryStrategyStore(),
    planning: new InMemoryPlanningStore(),
    account: new InMemoryAccountStore(),
    field: new InMemoryFieldStore(),
    signal: new InMemorySignalStore(),
    pipeline: new InMemoryPipelineStore(),
    delivery: new InMemoryDeliveryStore(),
    copilot: new InMemoryCopilotStore(),
    catalog: new InMemoryCatalogStore(),
  };
}

function seeded(): DemoStores {
  const s = stores();
  seedDemoWorkspace(WS, s);
  return s;
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
    assert.equal(rows.length, 20);
  } finally {
    if (saved !== undefined) process.env.YUCER_DEMO_DATA = saved;
    else delete process.env.YUCER_DEMO_DATA;
    if (savedDb !== undefined) process.env.DATABASE_URL = savedDb;
    resetDemoSeed();
    setPipelineStore(null);
  }
});

// --- The working set is big enough to look like one -----------------------

test("the demo has the working set it claims: 9 accounts, 20 deals, 6 projects", async () => {
  // Not decoration. Every list view, every roll-up and every "sickest first"
  // sort is meaningless at n=1, and a reviewer cannot tell a working sort from
  // a broken one on three rows.
  const s = seeded();
  const [accounts, opportunities, projects] = await Promise.all([
    s.account.listAccounts(WS),
    s.pipeline.listOpportunities(WS, { includeClosed: true }),
    s.delivery.listProjects(WS),
  ]);

  assert.equal(accounts.length, 9);
  // 13 on 2026-08-30: two subscription projects and the renewal deal already
  // open off one of them, so /renewal can show every verdict it has - including
  // `already_renewed`, which proves 0019's link is actually being read.
  //
  // 15 on 2026-08-31, for the same reason one level along: the forecast rule
  // has three downgrades and the demo triggered none of them, so the basis
  // column that renders their reasons had never run against a real row.
  //
  // 18 on 2026-09-01, and this one is about a number rather than a column:
  // forecast accuracy can only be stated for a period that is OVER, and every
  // closed deal here landed in the current quarter. Three wins in the prior
  // quarter give the demo a settled one, so the figure the append-only table
  // exists for finally has a surface it can appear on.
  //
  // 8 and 19 on 2026-09-01: an account on ground NO territory covers, and a
  // deal on it filed under no territory either. The unplaced rule was real in
  // code and invisible on screen - every other demo account sits somewhere
  // somebody covers, so a reviewer could not see what 未分区 means or how it
  // differs from the public pool.
  //
  // 9 and 20, same day: an account with no region on file at all, and a deal
  // on it filed under the demo's one single-region territory - the derivable
  // half of the completeness screen otherwise had no case where region
  // resolved to exactly one candidate.
  assert.equal(opportunities.length, 20);
  assert.equal(projects.length, 6);
});

test("every open stage is occupied, so the board has no empty column", async () => {
  const s = seeded();
  const rows = await s.pipeline.listOpportunities(WS);
  const occupied = new Set(rows.map((o) => o.stage));
  for (const stage of OPEN_STAGE_ORDER) {
    assert.ok(occupied.has(stage), `no demo opportunity sits at ${stage}`);
  }
});

// --- Referential integrity: the chain is real, not agreeing fixtures ------

test("every seeded deal carries its customer's NAME, not its id", async () => {
  // The pipeline page renders `accountName ?? accountId`, so a missing name
  // does not fail - it prints `acc_demo_2` in the column a seller reads first,
  // and nothing reports it. That is what this fixture did until 2026-09-04:
  // `accountName: undefined`, written out, while lead() had been passing the
  // real name since it was written.
  //
  // Asserted against the ACCOUNT LIST rather than a copy of the names, so the
  // check still means something after somebody renames a fixture.
  const s = seeded();
  const [accounts, opportunities] = await Promise.all([
    s.account.listAccounts(WS),
    s.pipeline.listOpportunities(WS, { includeClosed: true }),
  ]);
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  const wrong = opportunities
    .filter((o) => o.accountName !== nameById.get(o.accountId))
    .map((o) => `${o.opportunityNo}: ${o.accountName ?? "(none)"} for ${o.accountId}`);
  assert.deepEqual(wrong, [], `a deal must name its customer:\n  ${wrong.join("\n  ")}`);

  // And the id must never BE the name, which is the shape the fallback
  // produces and the one that reads as data on screen.
  const idsAsNames = opportunities.filter((o) => o.accountName === o.accountId);
  assert.deepEqual(idsAsNames, [], "an id in the name field renders as an id");
});

test("no record points at an id that does not exist", async () => {
  // The whole traceability claim rests on these keys. A dangling one would
  // render as a blank cell rather than an error, so nothing would report it.
  const s = seeded();
  const [accounts, opportunities, projects, leads, signals, campaigns] = await Promise.all([
    s.account.listAccounts(WS),
    s.pipeline.listOpportunities(WS, { includeClosed: true }),
    s.delivery.listProjects(WS),
    s.signal.listLeads(WS),
    s.signal.listSignals(WS),
    s.strategy.listCampaigns(WS),
  ]);
  const accountIds = new Set(accounts.map((a) => a.id));
  const oppIds = new Set(opportunities.map((o) => o.id));
  const signalIds = new Set(signals.map((x) => x.id));
  const campaignIds = new Set(campaigns.map((c) => c.id));

  for (const o of opportunities) {
    assert.ok(accountIds.has(o.accountId), `${o.id} -> missing account ${o.accountId}`);
    if (o.campaignId) assert.ok(campaignIds.has(o.campaignId), `${o.id} -> missing campaign`);
  }
  for (const p of projects) {
    assert.ok(accountIds.has(p.accountId), `${p.id} -> missing account ${p.accountId}`);
    if (p.opportunityId) assert.ok(oppIds.has(p.opportunityId), `${p.id} -> missing opportunity`);
  }
  for (const l of leads) {
    if (l.accountId) assert.ok(accountIds.has(l.accountId), `${l.id} -> missing account`);
    if (l.signalId) assert.ok(signalIds.has(l.signalId), `${l.id} -> missing signal`);
    if (l.campaignId) assert.ok(campaignIds.has(l.campaignId), `${l.id} -> missing campaign`);
    if (l.convertedOpportunityId) {
      assert.ok(oppIds.has(l.convertedOpportunityId), `${l.id} -> missing opportunity`);
    }
  }
  for (const x of signals) {
    if (x.accountId) assert.ok(accountIds.has(x.accountId), `${x.id} -> missing account`);
  }
});

test("a delivery project only ever comes from a WON deal", async () => {
  // A project hanging off an open or lost opportunity would show delivery
  // starting before the deal closed, which is the opposite of the rule the
  // conversion seam enforces.
  const s = seeded();
  const projects = await s.delivery.listProjects(WS);
  const linked = projects.filter((p) => p.opportunityId);
  assert.ok(linked.length >= 3, "most projects trace back to a deal");
  for (const p of linked) {
    const opp = await s.pipeline.getOpportunity(WS, p.opportunityId!);
    assert.equal(opp?.status, "won", `${p.id} hangs off a ${opp?.status} opportunity`);
  }
});

test("one chain runs the whole length of the product", async () => {
  // plan -> campaign -> signal -> lead -> opportunity -> project -> instalment.
  // This is the product thesis; if it were broken, every page would still
  // render and the claim would still be false.
  const s = seeded();

  const campaign = await s.strategy.getCampaign(WS, "camp_demo_3");
  assert.ok(campaign, "the campaign exists");
  assert.ok(await s.strategy.getPlan(WS, campaign.planId!), "and belongs to a real plan");

  const lead = (await s.signal.listLeads(WS)).find((l) => l.id === "lead_demo_3");
  assert.ok(lead, "the lead exists");
  assert.equal(lead.campaignId, campaign.id, "the lead carries the campaign");

  const signal = await s.signal.getSignal(WS, lead.signalId!);
  assert.ok(signal, "the lead came from a real signal");
  assert.equal(signal.status, "promoted", "and that signal was promoted, not merely scored");

  const opp = await s.pipeline.getOpportunity(WS, lead.convertedOpportunityId!);
  assert.ok(opp, "the lead converted to a real opportunity");
  assert.equal(opp.campaignId, lead.campaignId, "attribution was copied across the seam");
  assert.equal(opp.accountId, lead.accountId, "and so was the account");
  assert.equal(opp.status, "won");

  const project = (await s.delivery.listProjects(WS)).find((p) => p.opportunityId === opp.id);
  assert.ok(project, "the won deal became a project");
  assert.equal(project.accountId, opp.accountId, "the project sits on the same account");

  const instalments = await s.delivery.listInstalments(WS, project.id);
  assert.ok(instalments.length > 0, "and the project has a revenue schedule");
});

test("the campaign's attributed opportunities are the same ids the pipeline holds", async () => {
  // If these drifted, campaignReturn() would compute a number from fixtures
  // that agree with themselves by coincidence rather than from a real join.
  const s = seeded();
  const pipeline = await s.pipeline.listOpportunities(WS, { includeClosed: true });
  const byId = new Map(pipeline.map((o) => [o.id, o]));

  for (const campaignId of ["camp_demo_1", "camp_demo_2", "camp_demo_3"]) {
    const attributed = await s.strategy.attributedOpportunities(WS, campaignId);
    assert.ok(attributed.length > 0, `${campaignId} has attributed deals`);
    for (const a of attributed) {
      const opp = byId.get(a.id);
      assert.ok(opp, `${a.id} is attributed to ${campaignId} but not in the pipeline`);
      // The attribution list is a projection of the opportunity, so it must not
      // disagree with it - a campaign reporting a return the pipeline does not
      // show is the exact failure this join exists to prevent.
      assert.equal(opp.campaignId, campaignId, `${a.id} does not carry ${campaignId}`);
      assert.equal(a.amount?.amount, opp.amount?.amount, `${a.id} amount disagrees`);
      assert.equal(a.status, opp.status, `${a.id} status disagrees`);
    }
  }
});

test("the lead points at the signal and opportunity that actually exist", async () => {
  const s = seeded();
  const leads = await s.signal.listLeads(WS);
  const converted = leads.filter((l) => l.status === "converted");
  assert.ok(converted.length >= 2, "the demo must include completed conversions");

  for (const lead of converted) {
    assert.ok(await s.signal.getSignal(WS, lead.signalId!), "lead points at a real signal");
    const opp = await s.pipeline.getOpportunity(WS, lead.convertedOpportunityId!);
    assert.ok(opp, "lead points at a real opportunity");
    assert.equal(opp.campaignId, lead.campaignId, "the campaign was copied across the seam");
  }
});

// --- Fixtures that exist to make a rule visible ---------------------------

test("the delivery project demonstrates the overdue-forbids-green rule", async () => {
  // Reported green with an overdue instalment. If the fixture were clean, the
  // page would assert the rule without ever showing it.
  const s = seeded();

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
  const s = seeded();
  const rows = await s.pipeline.listOpportunities(WS, { includeClosed: true });
  const totals = rollUp(rows, "CNY");
  assert.ok(totals.ok);
  assert.ok(totals.value.commitAmount.amount > 0, "there is something to commit");
  assert.ok(totals.value.bestCaseAmount.amount > 0, "and something upside");
  assert.ok(totals.value.pipelineAmount.amount > 0, "and something early");
  assert.ok(totals.value.closedAmount.amount > 0, "and something already closed");
});

test("a terminal deal always carries the closed forecast category", async () => {
  // planCategoryChange rejects any other pairing in both directions. A fixture
  // that violates its own domain rule teaches the wrong shape.
  const s = seeded();
  for (const o of await s.pipeline.listOpportunities(WS, { includeClosed: true })) {
    const terminal = o.status === "won" || o.status === "lost";
    assert.equal(
      o.forecastCategory === "closed",
      terminal,
      `${o.id} is ${o.status} but forecast as ${o.forecastCategory}`,
    );
  }
});

test("the decision chain is complete on one account and unreachable on another", async () => {
  const s = seeded();
  const [contacts, relations] = await Promise.all([
    s.account.listContacts(WS, "acc_demo_1"),
    s.account.listRelations(WS, "acc_demo_1"),
  ]);
  const chain = analyzeChain(contacts, relations);

  assert.deepEqual(chain.missing, [], "economic, technical and coach are all covered");
  assert.equal(chain.blockers.length, 1, "and there is a blocker to show");
  assert.equal(chain.economicBuyerUnreachable, false, "a coach can reach the buyer");

  // The contrast case: a buyer on file whom nobody can introduce us to. Without
  // it the surface never shows the distinction it leads with.
  const [c4, r4] = await Promise.all([
    s.account.listContacts(WS, "acc_demo_4"),
    s.account.listRelations(WS, "acc_demo_4"),
  ]);
  const weak = analyzeChain(c4, r4);
  assert.ok(
    c4.some((c) => c.decisionRole === "economic"),
    "the buyer is on file",
  );
  assert.equal(weak.economicBuyerUnreachable, true, "and still unreachable");
});

test("the inbox contains an unmatched signal, which is the new-logo case", async () => {
  const s = seeded();
  const signals = await s.signal.listSignals(WS);
  assert.ok(
    signals.some((x) => x.accountId == null && (x.score ?? 0) > 50),
    "a high-scoring signal with no account match must be present - it is what the rule is for",
  );
});

test("one lead has no account, so convert is unavailable with a reason", async () => {
  const s = seeded();
  const leads = await s.signal.listLeads(WS);
  assert.ok(
    leads.some((l) => l.accountId == null && l.status !== "converted"),
    "an unmatched lead must be present - it is the case the convert seam refuses",
  );
});

test("planning has a target with no snapshot, so the two null cases are visible", async () => {
  const s = seeded();
  const targets = await s.planning.listTargets(WS, { period: "2026Q3" });
  const withoutSnapshot: string[] = [];
  for (const t of targets) {
    if ((await s.planning.publishedTotalsFor(WS, t)) == null) withoutSnapshot.push(t.id);
  }
  assert.ok(withoutSnapshot.length > 0, "one scope must be unforecast, to distinguish it from 0%");
  assert.ok(withoutSnapshot.length < targets.length, "and others must have snapshots");
});

test("the review debt is partial: some closed deals reviewed, some not", async () => {
  // All-reviewed hides the debt; none-reviewed hides the fact that recording a
  // review removes it. Only a mixed set shows both.
  const s = seeded();
  const closed = (await s.pipeline.listOpportunities(WS, { includeClosed: true })).filter(
    (o) => o.status === "won" || o.status === "lost",
  );
  const pending = await s.pipeline.listUnreviewedClosed(WS);

  assert.ok(pending.length > 0, "there is outstanding learning debt");
  assert.ok(pending.length < closed.length, "and some deals have visibly left it");
  const reviewed = await s.pipeline.getWinLossReview(WS, "opp_demo_5");
  assert.ok(reviewed?.lessons, "a completed review carries its lesson, not just a tick");
});

test("the stage journal is contiguous and ends where the deal now sits", async () => {
  // A history with a jump in it would make the journal look like decoration
  // rather than the record that every stage move writes.
  const s = seeded();
  for (const id of ["opp_demo_1", "opp_demo_4", "opp_demo_5", "opp_demo_6"]) {
    const events = await s.pipeline.listStageEvents(WS, id);
    assert.ok(events.length >= 3, `${id} has a history`);
    assert.equal(events[0].fromStage, null, `${id} starts from nothing`);
    for (let i = 1; i < events.length; i += 1) {
      assert.equal(events[i].fromStage, events[i - 1].toStage, `${id} jumps a stage at ${i}`);
      assert.ok(
        events[i].occurredAt.getTime() > events[i - 1].occurredAt.getTime(),
        `${id} event ${i} does not move forward in time`,
      );
    }
    const opp = await s.pipeline.getOpportunity(WS, id);
    assert.equal(events[events.length - 1].toStage, opp?.stage, `${id} history disagrees with its stage`);
  }
});

test("a closed deal's last stage event lands on the day it closed", async () => {
  const s = seeded();
  for (const id of ["opp_demo_4", "opp_demo_5"]) {
    const events = await s.pipeline.listStageEvents(WS, id);
    const opp = await s.pipeline.getOpportunity(WS, id);
    assert.equal(
      events[events.length - 1].occurredAt.getTime(),
      opp?.closedAt?.getTime(),
      `${id} closed on a different day than it was journalled`,
    );
  }
});

test("the proposal queue has pending items and one already decided", async () => {
  const s = seeded();
  const proposals = await s.copilot.listProposals(WS);
  assert.ok(proposals.filter((p) => p.status === "proposed").length >= 2);
  assert.ok(proposals.some((p) => p.decidedBySub != null), "history is visible too");
});

test("every proposal names a subject that exists", async () => {
  // A proposal about a deleted or invented record is one a human cannot judge,
  // and judging is the only thing the proposal exists for.
  const s = seeded();
  const proposals = await s.copilot.listProposals(WS);
  assert.ok(proposals.length > 0);
  for (const p of proposals) {
    if (p.subjectType === "opportunity") {
      assert.ok(await s.pipeline.getOpportunity(WS, p.subjectId), `${p.id} -> missing ${p.subjectId}`);
    } else if (p.subjectType === "account") {
      assert.ok(await s.account.getAccount(WS, p.subjectId), `${p.id} -> missing ${p.subjectId}`);
    } else if (p.subjectType === "lead") {
      const leads = await s.signal.listLeads(WS);
      assert.ok(
        leads.some((l) => l.id === p.subjectId),
        `${p.id} -> missing ${p.subjectId}`,
      );
    }
  }
});

test("the playbook catalog is seeded and its plays are active", async () => {
  // Playbook grounding reads active plays only. A catalog seeded as drafts
  // would ground nothing while looking populated on screen.
  const s = seeded();
  const plays = await s.copilot.listPlaybooks(WS, { activeOnly: true });
  assert.ok(plays.length >= 3, "there are plays to ground on");
  assert.ok(
    plays.some((p) => p.scopeDomain === "copilot"),
    "including a cross-cutting one, for turns with no subject",
  );
  for (const p of plays) assert.ok(p.content.trim().length > 0, `${p.playbookCode} has no content`);
});

// The evidence plane must agree with the account rows it explains, not merely
// exist. These crossings are what make the demo a demonstration of the rule
// rather than a screenshot of populated tables.
test("demo: the evidence plane and the account health inputs tell one story", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);

  // Last contact from the interaction table matches what the health input
  // claims. With a database the page reads the former, offline it reads the
  // latter, and a demo where those disagree is a demo that lies in one mode.
  const last = await s.field.lastContactAt(WS, "acc_demo_1");
  assert.ok(last, "acc_demo_1 has recorded interactions");
  const days = Math.round((DEMO_NOW.getTime() - last.getTime()) / 86_400_000);
  assert.equal(days, 48);

  // A prospect nobody has met has no contact date at all - not a recent one.
  assert.equal(await s.field.lastContactAt(WS, "acc_demo_3"), null);

  // The one met commitment cites an interaction that actually exists, and that
  // interaction is on the same account. Closure evidence pointing at a foreign
  // row would pass every type check and be worthless.
  const met = (await s.field.listCommitments(WS, { accountId: "acc_demo_2" })).find(
    (c) => c.status === "met",
  );
  assert.ok(met, "acc_demo_2 has a met commitment");
  assert.equal(met.closureEvidenceKind, "interaction");
  const evidence = (await s.field.listInteractions(WS, { accountId: "acc_demo_2" })).find(
    (i) => i.id === met.closureEvidenceId,
  );
  assert.ok(evidence, "the closure evidence is a real interaction on the same account");
  assert.ok(evidence.occurredAt.getTime() >= met.dueAt.getTime() - 7 * 86_400_000);

  // Every open commitment predates or matches an interaction on its account,
  // so nothing was promised on an account with no recorded contact.
  for (const c of await s.field.listCommitments(WS)) {
    const on = await s.field.listInteractions(WS, { accountId: c.accountId });
    assert.ok(on.length > 0, `${c.id} hangs off an account with recorded contact`);
  }
});

test("demo: overdue promises exist on both sides", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);
  const at = DEMO_NOW;

  const overdue = await s.field.listCommitments(WS, { overdueAt: at });
  assert.ok(overdue.length >= 2, "the manager list is not empty in the demo");
  // Oldest first - the work-queue order the UI depends on.
  for (let i = 1; i < overdue.length; i += 1) {
    assert.ok(overdue[i - 1].dueAt.getTime() <= overdue[i].dueAt.getTime());
  }
  // Ours appears alongside theirs. A demo showing only customer failures would
  // be selling a scoreboard rather than a diagnosis.
  assert.ok(overdue.some((c) => c.direction === "we_owe"));
  assert.ok(overdue.some((c) => c.direction === "they_owe"));
});

test("demo: acc_demo_1's kept-rate is what its health score looks like from underneath", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);
  const at = DEMO_NOW;

  const r = reliability(await s.field.listCommitments(WS, { accountId: "acc_demo_1" }), at);
  // One resolved miss plus one still-open overdue.
  assert.equal(r.theyMissed, 2);
  assert.equal(r.theirKeptRate, 0);

  // No history is not a perfect record.
  const clean = reliability(await s.field.listCommitments(WS, { accountId: "acc_demo_3" }), at);
  assert.equal(clean.theirKeptRate, null);
  assert.equal(clean.theyMissed, 0);
});

test("demo: acc_demo_4 shows the gap the two chain panels exist to separate", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);
  const at = DEMO_NOW;

  const contacts = await s.account.listContacts(WS, "acc_demo_4");
  const relations = await s.account.listRelations(WS, "acc_demo_4");
  const last = await s.field.lastContactByContact(WS, "acc_demo_4");

  // Both panels say unreachable, for INDEPENDENT reasons. Structurally: ct_7
  // and ct_8 have no edge between them, a fixture batch 3 set up on purpose.
  assert.equal(analyzeChain(contacts, relations).economicBuyerUnreachable, true);

  // But nobody has ever been in a recorded room with ct_7. Seven meetings, all
  // with the coach - which is what a weekly-catch-up-with-my-friend deal looks
  // like from the outside.
  assert.ok(last.has("ct_8"), "the coach has recorded contact");
  assert.equal(last.has("ct_7"), false, "the economic buyer has none");

  const recency = analyzeChainRecency(
    contacts,
    relations,
    contacts.map((c) => ({ contactId: c.id, lastContactAt: last.get(c.id) ?? null })),
    { now: at },
  );
  // Evidentially: nobody has ever been in a room with ct_7. Two reasons landing
  // on one verdict is worth more than either alone - and had the org chart been
  // filled in optimistically, this half would still have caught it.
  assert.equal(recency.warmPathToEconomic, false);
  assert.ok(recency.unrecorded.some((c) => c.id === "ct_7"));
});

test("demo: acc_demo_1 is the mirror - access is fine, the promises are not", async () => {
  // The contrast that makes two panels worth having. Here both agree the
  // decision-maker is reachable and warm, so a reader who saw only the chain
  // would conclude the account is healthy. Its health score is 34, and the
  // reason is entirely in the commitment table.
  const s = stores();
  seedDemoWorkspace(WS, s);
  const at = DEMO_NOW;

  const contacts = await s.account.listContacts(WS, "acc_demo_1");
  const relations = await s.account.listRelations(WS, "acc_demo_1");
  const last = await s.field.lastContactByContact(WS, "acc_demo_1");

  assert.equal(analyzeChain(contacts, relations).economicBuyerUnreachable, false);
  const r = analyzeChainRecency(
    contacts,
    relations,
    contacts.map((c) => ({ contactId: c.id, lastContactAt: last.get(c.id) ?? null })),
    { now: at },
  );
  assert.equal(r.warmPathToEconomic, true, "the buyer has been met, and recently enough");

  // And yet: two promises they made are broken.
  const rel = reliability(await s.field.listCommitments(WS, { accountId: "acc_demo_1" }), at);
  assert.equal(rel.theyMissed, 2);
});

test("demo: an account with recorded contact answers the warm-path question", async () => {
  const s = stores();
  seedDemoWorkspace(WS, s);
  const at = DEMO_NOW;

  for (const acc of ["acc_demo_1", "acc_demo_2"]) {
    const contacts = await s.account.listContacts(WS, acc);
    const relations = await s.account.listRelations(WS, acc);
    const last = await s.field.lastContactByContact(WS, acc);
    const r = analyzeChainRecency(
      contacts,
      relations,
      contacts.map((c) => ({ contactId: c.id, lastContactAt: last.get(c.id) ?? null })),
      { now: at },
    );
    assert.notEqual(r.warmPathToEconomic, null, `${acc} has evidence, so the question is answerable`);
  }

  // acc_demo_3 has no contacts and no interactions at all - unanswerable, and
  // that must stay null rather than becoming a false claim about the customer.
  const c3 = await s.account.listContacts(WS, "acc_demo_3");
  const l3 = await s.field.lastContactByContact(WS, "acc_demo_3");
  const r3 = analyzeChainRecency(c3, [], c3.map((c) => ({ contactId: c.id, lastContactAt: l3.get(c.id) ?? null })), { now: at });
  assert.equal(r3.warmPathToEconomic, null);
});

// ADR-014 section 2, checked against the demo itself.
//
// A demo where the header and its lines disagree would teach exactly the mess
// the reconciliation rule exists to prevent, and it would do it silently -
// nobody reads a total and its detail at the same time.
test("every seeded deal with lines reconciles to their sum", async () => {
  const saved = process.env.YUCER_DEMO_DATA;
  const savedDb = process.env.DATABASE_URL;
  process.env.YUCER_DEMO_DATA = "on";
  delete process.env.DATABASE_URL;
  try {
    resetDemoSeed();
    assert.equal(ensureDemoData(WS), true);
    const { getPipelineStore, getCatalogStore } = await import("./registry");
    const deals = await getPipelineStore().listOpportunities(WS, { includeClosed: true });
    const lines = await getCatalogStore().allLines(WS);

    const { reconciles } = await import("../catalog/lib/pricing");
    let checked = 0;
    for (const d of deals) {
      const mine = lines.filter((l) => l.opportunityId === d.id);
      if (mine.length === 0) continue;
      checked += 1;
      assert.equal(
        reconciles(d.amount?.amount ?? null, mine),
        true,
        `${d.id}: header ${d.amount?.amount} does not equal its lines`,
      );
    }
    assert.ok(checked >= 5, "the demo must actually exercise composed deals");

    // And the approval flag needs a real case, or nobody ever sees it render.
    assert.ok(
      lines.some((l) => l.needsApproval),
      "at least one seeded line must be below floor",
    );
  } finally {
    if (saved !== undefined) process.env.YUCER_DEMO_DATA = saved;
    else delete process.env.YUCER_DEMO_DATA;
    if (savedDb !== undefined) process.env.DATABASE_URL = savedDb;
    resetDemoSeed();
  }
});

// A duplicate id silently overwrote four seeded signals and only one of them
// was visibly missing, because the page shows a subset. Ids are cheap to check
// and expensive to debug.
test("no seeded record shares an id with another of its kind", async () => {
  const saved = process.env.YUCER_DEMO_DATA;
  const savedDb = process.env.DATABASE_URL;
  process.env.YUCER_DEMO_DATA = "on";
  delete process.env.DATABASE_URL;
  try {
    resetDemoSeed();
    assert.equal(ensureDemoData(WS), true);
    const { getSignalStore, getPipelineStore, getAccountStore } = await import("./registry");
    const groups: Array<[string, { id: string }[]]> = [
      ["signals", await getSignalStore().listSignals(WS, { limit: 500 })],
      ["leads", await getSignalStore().listLeads(WS, { limit: 500 })],
      ["opportunities", await getPipelineStore().listOpportunities(WS, { includeClosed: true })],
      ["accounts", await getAccountStore().listAccounts(WS)],
    ];
    for (const [name, rows] of groups) {
      const ids = rows.map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, `${name} has duplicate ids`);
    }
  } finally {
    if (saved !== undefined) process.env.YUCER_DEMO_DATA = saved;
    else delete process.env.YUCER_DEMO_DATA;
    if (savedDb !== undefined) process.env.DATABASE_URL = savedDb;
    resetDemoSeed();
  }
});

test("the demo's pending proposals survive the expiry rule, and one does not", async () => {
  // THE REGRESSION THIS PREVENTS. Every proposal hung off the fixed anchor
  // until 2026-08-31, so once expiry shipped the demo's whole queue expired
  // itself the first time anybody opened it - four pending recommendations
  // gone, the board count and the home stream with them, for a reason no
  // reader could see. For a proposal the age is not a displayed detail, it is
  // the state, so proposals alone are seeded against the real clock.
  const s = seeded();
  const now = new Date();
  const proposals = await s.copilot.listProposals(WS, {});

  const pending = proposals.filter((p) => p.status === "proposed");
  const stillPending = pending.filter(
    (p) => now.getTime() - p.createdAt.getTime() < DEFAULT_PROPOSAL_TTL_MS,
  );
  const aged = pending.filter(
    (p) => now.getTime() - p.createdAt.getTime() >= DEFAULT_PROPOSAL_TTL_MS,
  );

  assert.ok(stillPending.length >= 3, "the demo must keep a working pending queue");
  assert.equal(aged.length, 1, "and exactly one that the sweep will retire, to show it happening");
  assert.equal(aged[0].id, "act_demo_6");
});

test("nothing about the demo restates the anchor as a literal", () => {
  // The coupling this removes. Six places in this file wrote
  // `new Date("2026-08-15T00:00:00Z")` - the same instant the seed used - so
  // the seed and its tests agreed only as long as nobody moved either. They
  // ask DEMO_NOW for it now, and this keeps the literal from growing back.
  //
  // SCOPED TO THE DEMO, deliberately. Rule and service unit tests pin their own
  // fixed clock and should: a unit test wants a deterministic instant and has
  // no demo fixtures in it. Several happen to use the same date, which is
  // convention, not coupling.
  const src = readFileSync(new URL("./demo-seed.test.ts", import.meta.url), "utf8");
  const seed = readFileSync(new URL("./demo-seed.ts", import.meta.url), "utf8");
  const literal = /new Date\(\s*"20\d\d-\d\d-\d\dT/;

  // Comments are stripped so the paragraph explaining the old literal does not
  // count as using it - the same trap wired.test.ts documents.
  const code = (t: string) =>
    t
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ")
      .replace(/([^:])\/\/.*$/gm, "$1");

  assert.ok(!literal.test(code(seed)), "demo-seed.ts must derive every date from DEMO_NOW");
  assert.ok(!literal.test(code(src)), "the demo's tests must ask DEMO_NOW for the demo's now");
});

test("the demo's anchor is the clock the product reads, not a date in the past", () => {
  // The whole point. A demo seeded against a stale instant shows a reader
  // relative dates that are wrong by exactly how stale it is - "lapsed 29 days"
  // for a term seeded at 12 - and, once a rule reads the clock rather than
  // printing it, changes what the product DOES with the fixtures.
  assert.ok(Math.abs(Date.now() - DEMO_NOW.getTime()) < 60 * 60 * 1000);
});


// --- What the demo does when somebody clicks 采纳 ----------------------------
//
// Accepting performs the action as of 2026-09-01, so the demo's proposals stop
// being decoration: each one either moves a real deal or does not, and a
// reviewer clicking through will see which. These assertions are about the
// DEMO'S OWN COHERENCE, which nothing else checks.

test("every demo advance_stage proposal is a move the stage machine allows", async () => {
  // A demo proposal that fails on accept teaches the reader that the product is
  // broken. Both of these were checked by hand when execution was wired; this
  // is the version that keeps being checked - editing a demo deal's stage
  // without editing the proposal aimed at it is an easy and silent mistake.
  const s = seeded();
  const proposals = await s.copilot.listProposals(WS, { status: "proposed" });
  const moves = proposals.filter((p) => p.actionType === "advance_stage");
  assert.ok(moves.length > 0, "the demo should show at least one performable proposal");

  for (const p of moves) {
    assert.equal(p.subjectType, "opportunity", `${p.id} advances something that has no stage`);
    const to = (p.payload as { to?: unknown }).to;
    assert.ok(typeof to === "string" && isStage(to), `${p.id} names ${String(to)}, not a stage`);

    const deal = await s.pipeline.getOpportunity(WS, p.subjectId);
    assert.ok(deal, `${p.id} points at ${p.subjectId}, which the demo does not seed`);
    const plan = planStageChange(
      {
        stage: deal.stage,
        status: deal.status,
        probability: deal.probability,
        closedAt: deal.closedAt,
        hasWinLossReview: false,
      },
      { to: to as never, actorSub: "usr_demo", reason: p.rationale ?? undefined },
    );
    assert.equal(
      plan.ok,
      true,
      `${p.id} would fail on accept: ${plan.ok ? "" : plan.violations.map((v) => v.code).join(", ")}`,
    );
  }
});

test("the demo shows both kinds of proposal, performed and needing a person", () => {
  // The distinction only teaches anything if the queue actually contains both.
  // A demo of only performable proposals would hide the marker; a demo of only
  // manual ones would make accepting look like it never does anything.
  const s = seeded();
  return s.copilot.listProposals(WS, { status: "proposed" }).then((proposals) => {
    const performed = proposals.filter((p) => isExecutable(p.actionType));
    const manual = proposals.filter((p) => !isExecutable(p.actionType));
    assert.ok(performed.length > 0, "no demo proposal would actually do anything");
    assert.ok(manual.length > 0, "no demo proposal shows the needs-a-person case");
  });
});


// --- The settled quarter, and the number it exists to make visible -----------

test("the demo has a quarter that is over, with a scorecard the two figures disagree on", async () => {
  // WHY THIS FIXTURE EXISTS. Forecast accuracy is period-end actual against the
  // opening snapshot, so it needs a period that has ENDED - and until
  // 2026-09-01 every closed deal in this demo landed in the current quarter, so
  // the badge could never render. A reviewer could see the append-only
  // trajectory and never the thing it is kept for.
  //
  // AND THE TWO FIGURES MUST DIFFER. A quarter that undershot scores the same
  // number twice (attainment 60%, accuracy 60%) and teaches nobody why there
  // are two of them. This one was beaten AND forecast badly, which is the pair
  // the scorecard exists to separate.
  const s = seeded();
  const { forecastScorecard } = await import("../pipeline/service");
  const { EMPTY_ENTITLEMENT } = await import("../../entitlement/types");
  const { permissionsForRoles } = await import("../../authz/catalog");

  const r = await forecastScorecard(
    {
      workspaceId: WS,
      sub: "usr_demo",
      holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
      entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" },
      store: s.pipeline,
    },
    DEMO_PRIOR_PERIOD,
    { now: DEMO_NOW },
  );

  const card = unwrap(r);
  assert.equal(card.settled, true, "the prior quarter must be over relative to the demo's clock");
  assert.ok(card.opening, "and it must have an opening snapshot, or there is nothing to score");
  assert.equal(card.opening?.commitAmount.amount, 2_600_000);
  assert.equal(card.actualClosed.amount, 3_200_000);

  assert.equal(Math.round((card.attainment ?? 0) * 100), 123);
  assert.equal(Math.round((card.accuracy ?? 0) * 100), 77);
  assert.notEqual(
    Math.round((card.attainment ?? 0) * 100),
    Math.round((card.accuracy ?? 0) * 100),
    "if these coincide the demo stops teaching the difference between them",
  );
});

test("the settled quarter's last snapshot agrees with what the board computes for it", async () => {
  // The same rule the current quarter's series follows: a snapshot that
  // disagrees with the live board is a demo teaching the "total and detail
  // disagree" mess this repo keeps arguing against. A finished quarter drains
  // to zero commit and full closed, and the fixture has to actually do that.
  const s = seeded();
  const rows = await s.pipeline.listForecastSnapshots(WS, {
    period: DEMO_PRIOR_PERIOD,
    scopeType: "workspace",
  });
  assert.ok(rows.length >= 2, "a single point is not a trajectory");

  const last = [...rows].sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime()).at(-1)!;
  assert.equal(last.commitAmount.amount, 0);
  assert.equal(last.closedAmount.amount, 3_200_000);
});


// --- 未分区, and how it differs from the public pool -------------------------

test("the demo has a customer no territory covers, or the unplaced rule is invisible", async () => {
  // THE GAP THIS CLOSES. Every other demo account sits on ground somebody
  // covers, so `unplacedAccountIds` resolved to empty and a territory-scoped
  // reviewer could not see what 未分区 means - the rule was real in code and
  // absent from every screen.
  //
  // Derived through `coveringTerritories`, the rule routing and the scope
  // resolver both use, rather than by comparing region strings here. A local
  // comparison would keep agreeing with itself while the real matcher moved.
  const s = seeded();
  const territories = await s.planning.listTerritories(WS);
  const accounts = await s.account.listAccounts(WS);

  const unplaced = accounts.filter(
    (a) => a.region == null || coveringTerritories(a.region, territories).length === 0,
  );
  assert.ok(
    unplaced.length > 0,
    "no demo customer is unplaced - the 未分区 rule has nothing to demonstrate",
  );
  assert.ok(
    unplaced.length < accounts.length,
    "every demo customer is unplaced - then territory scope narrows nothing and proves nothing",
  );

  // AND IT MUST HAVE AN OWNER, which is the whole distinction. 公海 is a row
  // with no owner, visible everywhere and claimable. 未分区 is a row somebody
  // holds that nobody has filed. An unowned unplaced account would demonstrate
  // the wrong one.
  for (const a of unplaced) {
    assert.ok(a.ownerSub, `${a.name} is unplaced AND unowned - that is the public pool, not 未分区`);
  }
});

test("a deal on the unplaced customer is filed under no territory either", async () => {
  // Both paths blank is the only way to reach the unplaced rule: given a
  // territory of its own the deal simply belongs to that one, and the case
  // disappears from the demo again without anything failing.
  //
  // REGION SET BUT UNCOVERED, not "no region at all" - completeness.ts draws
  // this exact line between two different gaps (regionUnplaced vs the
  // derivable/forModel "region" gap), and since 港澳零售集团 the demo has both:
  // a null-region account IS allowed a deal with its own territory (that
  // territory is precisely what makes its region derivable), so the broader
  // `region == null` reading this test used before would wrongly catch it too.
  const s = seeded();
  const territories = await s.planning.listTerritories(WS);
  const accounts = await s.account.listAccounts(WS);
  const unplacedIds = new Set(
    accounts
      .filter((a) => a.region != null && coveringTerritories(a.region, territories).length === 0)
      .map((a) => a.id),
  );

  const deals = await s.pipeline.listOpportunities(WS, { includeClosed: true });
  const onUnplaced = deals.filter((d) => d.accountId && unplacedIds.has(d.accountId));
  assert.ok(onUnplaced.length > 0, "no demo deal sits on an unplaced customer");
  for (const d of onUnplaced) {
    assert.equal(d.territoryId, null, `${d.name} carries a territory, so it is filed after all`);
    assert.ok(d.ownerSub, `${d.name} is unowned - that is the public pool, not 未分区`);
  }
});

// --- The region-derivable case, and why it needs a single-region territory --

test("the demo has a customer whose region the data can derive, or the completeness screen's derivable half has nothing to show", async () => {
  // THE GAP THIS CLOSES. All three original territories cover two regions
  // each, so accountGaps() always found more than one candidate for region
  // and always declined - the "the data already knows this" half of the
  // completeness screen had no case in the demo where it could ever suggest
  // anything. terr_hk covers exactly one region, and 港澳零售集团's one deal
  // is filed under it.
  const s = seeded();
  const territories = await s.planning.listTerritories(WS);
  const accounts = await s.account.listAccounts(WS);
  const deals = await s.pipeline.listOpportunities(WS, { includeClosed: true });

  const territoryInputs = territories.map((t) => ({
    id: t.id,
    name: t.name,
    ownerSub: t.ownerSub,
    regions: t.regions ?? [],
    status: t.status,
  }));

  const account = accounts.find((a) => a.name === "港澳零售集团");
  assert.ok(account, "the region-derivable demo account is missing");
  assert.equal(account.region, null, "this account's region must be blank for the case to exist at all");

  const gaps = accountGaps(
    account,
    deals
      .filter((d) => d.accountId === account.id)
      .map((d) => ({ territoryId: d.territoryId, ownerSub: d.ownerSub })),
    territoryInputs,
    [],
  );
  const derivable = fillable(gaps).find((g) => g.field === "region");
  assert.ok(derivable, "no derivable region gap - a single-region territory alone is not enough without a deal on it");
  assert.equal(derivable?.suggestion, "港澳");
  assert.ok(derivable?.basis, "a suggestion with no basis is a machine writing into a record on nobody's authority");
});

test("every other demo territory still covers two regions - the ambiguous case is not accidentally gone", async () => {
  // This account exists BECAUSE the other three territories are ambiguous for
  // region derivation; if that ever stopped being true, this test's account
  // would be redundant and the workplan note that motivated it would be
  // wrong. Pinning it here means a future edit that narrows terr_east etc.
  // down to one region gets caught rather than silently making 港澳零售集团
  // the only reason this repo still needs a single-region territory.
  const s = seeded();
  const territories = await s.planning.listTerritories(WS);
  const original = territories.filter((t) => t.id !== "terr_hk");
  assert.ok(original.length > 0);
  for (const t of original) {
    assert.equal(t.regions.length, 2, `${t.name} no longer covers exactly two regions`);
  }
});
