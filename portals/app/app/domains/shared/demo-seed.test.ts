import { test } from "node:test";
import assert from "node:assert/strict";
import { seedDemoWorkspace, type DemoStores } from "./demo-seed";
import { demoDataEnabled, ensureDemoData, resetDemoSeed, setPipelineStore } from "./registry";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryFieldStore } from "../account/field-store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryDeliveryStore } from "../delivery/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryPlanningStore } from "../planning/store";
import { InMemorySignalStore } from "../signal/store";
import { InMemoryStrategyStore } from "../strategy/store";
import { rollUp } from "../pipeline/lib/forecast";
import { OPEN_STAGE_ORDER } from "../pipeline/lib/stage";
import { deriveProjectHealth } from "../delivery/lib/revenue";
import { analyzeChain, analyzeChainRecency } from "../account/lib/health";
import { reliability } from "../account/lib/commitment";

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
    assert.equal(rows.length, 12);
  } finally {
    if (saved !== undefined) process.env.YUCER_DEMO_DATA = saved;
    else delete process.env.YUCER_DEMO_DATA;
    if (savedDb !== undefined) process.env.DATABASE_URL = savedDb;
    resetDemoSeed();
    setPipelineStore(null);
  }
});

// --- The working set is big enough to look like one -----------------------

test("the demo has the working set it claims: 7 accounts, 12 deals, 4 projects", async () => {
  // Not decoration. Every list view, every roll-up and every "sickest first"
  // sort is meaningless at n=1, and a reviewer cannot tell a working sort from
  // a broken one on three rows.
  const s = seeded();
  const [accounts, opportunities, projects] = await Promise.all([
    s.account.listAccounts(WS),
    s.pipeline.listOpportunities(WS, { includeClosed: true }),
    s.delivery.listProjects(WS),
  ]);

  assert.equal(accounts.length, 7);
  assert.equal(opportunities.length, 12);
  assert.equal(projects.length, 4);
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
    if ((await s.planning.closedAmountFor(WS, t)) == null) withoutSnapshot.push(t.id);
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
  const days = Math.round((Date.parse("2026-08-15T00:00:00Z") - last.getTime()) / 86_400_000);
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
  const at = new Date("2026-08-15T00:00:00Z");

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
  const at = new Date("2026-08-15T00:00:00Z");

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
  const at = new Date("2026-08-15T00:00:00Z");

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
  const at = new Date("2026-08-15T00:00:00Z");

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
  const at = new Date("2026-08-15T00:00:00Z");

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
