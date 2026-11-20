import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDiagnosticSnapshots, type DiagnosticSource, type DiagnosticDeal } from "./diagnostic-snapshots";
import { emptyContent, type SalesPlan, type PlanRevision, type PlanEvent } from "../../planning/plan-model";
import { InMemoryStrategyStore } from "../store";
import { runStrategySnapshots } from "../snapshot-job";

const NOW = new Date("2026-11-19T12:00:00Z");
function deal(overrides: Partial<DiagnosticDeal> = {}): DiagnosticDeal {
  return { id: "d1", accountId: "a1", territoryId: "r1", status: "won", amount: "100.10", currency: "CNY", closedAt: new Date("2026-10-01T00:00:00Z"), ...overrides };
}
function publication(): SalesPlan {
  const content = emptyContent(2026, [], "CNY");
  content.regions = [{ id: "r1", divisionId: "division1", code: "east", name: "East", provinces: [], included: true, reason: "", ownerSub: null }];
  content.targets = [{ key: "line1", scope: "territory:r1", metric: "revenue", currency: "CNY", period: "2026Q4", floor: "600.00", target: "1000.00", stretch: "1200.00", note: "" }];
  const revision: PlanRevision = { id: "rev1", state: "sealed", version: 1, editToken: 1, baseId: null, restoresId: null, content, contentHash: "hash", reason: "", createdBy: "u", createdAt: "2026-10-01T00:00:00.000Z", sealedBy: "u", sealedAt: "2026-10-01T00:00:00.000Z" };
  const event: PlanEvent = { id: "e1", no: 1, kind: "release", revisionId: revision.id, relatedId: null, period: null, at: revision.createdAt, effectiveAt: revision.createdAt, actor: "u", reason: "", requestKey: "req1", requestHash: "hash" };
  return { id: "p1", workspaceId: "ws", year: 2026, revisions: [revision], events: [event], legacy: [] };
}
function source(): DiagnosticSource {
  return { currency: "CNY", segments: [{ id: "s1", criteria: { industries: ["Retail"], regions: [] } }, { id: "s2", criteria: { industries: ["Manufacturing"], regions: [] } }],
    accounts: [{ id: "a1", segmentId: "s2", industry: "Retail", region: null, customerSize: null }, { id: "a2", segmentId: "s1", industry: "Manufacturing", region: null, customerSize: null }],
    deals: [deal(), deal({ id: "d2", accountId: "a2", amount: "200.20", status: "open", closedAt: null })], plans: [publication()] };
}

test("market coverage uses criteria, not assignment, and each market gets only its customers' deals", () => {
  const result = computeDiagnosticSnapshots(source(), NOW);
  assert.deepEqual(result.segments.map(r => [r.matchedAccountCount, r.openPipelineAmount, r.wonAmount]), [[1, 0, 100.1], [1, 200.2, 0]]);
  assert.equal(result.segments[0].basis?.kind, "criteria");
  assert.equal(result.territories[0].attainedAmount, 100.1);
});

test("UUID deduplication, exact cents, currency partitioning and lost-deal exclusion", () => {
  const s = source();
  s.deals = [deal({ amount: "0.10" }), deal({ amount: "0.10" }), deal({ id: "second", amount: "0.20" }), deal({ id: "usd", currency: "USD", amount: "9000.00" }), deal({ id: "lost", status: "lost", amount: "9000.00" })];
  const r = computeDiagnosticSnapshots(s, NOW);
  assert.equal(r.segments[0].wonAmount, 0.3);
  assert.equal(r.territories[0].attainedAmount, 0.3);
  assert.equal(r.segments[0].basis?.excludedCurrencyDeals, 1);
});

test("periods are half-open; different regions, older quarters and future wins stay out", () => {
  const s = source();
  s.deals = [deal(), deal({ id: "prior", closedAt: new Date("2026-09-30T23:59:59.999Z"), amount: "900.00" }), deal({ id: "next", closedAt: new Date("2027-01-01T00:00:00Z"), amount: "800.00" }), deal({ id: "future", closedAt: new Date("2026-12-01T00:00:00Z"), amount: "700.00" }), deal({ id: "region2", territoryId: "r2", amount: "600.00" })];
  assert.equal(computeDiagnosticSnapshots(s, NOW).territories[0].attainedAmount, 100.1);
});

test("unknown money, closing date and regional attribution do not become confirmed zeros", () => {
  for (const change of [{ amount: null }, { closedAt: null }, { territoryId: null }]) {
    const s = source(); s.deals = [deal(change)];
    assert.equal(computeDiagnosticSnapshots(s, NOW).territories[0].attainedAmount, null);
  }
  const s = source(); s.deals = [deal({ status: "open", amount: null })];
  assert.equal(computeDiagnosticSnapshots(s, NOW).segments[0].openPipelineAmount, null);
  s.deals = [deal({ closedAt: null })];
  assert.equal(computeDiagnosticSnapshots(s, NOW).segments[0].wonAmount, null);
});

test("only the effective publication supplies targets; draft and scheduled revisions cannot replace it", () => {
  const s = source(), p = s.plans[0];
  const scheduled = structuredClone(p.revisions[0]); scheduled.id = "rev2"; scheduled.version = 2; scheduled.content.targets[0].target = "2000.00";
  const draft = structuredClone(scheduled); draft.id = "draft"; draft.state = "draft"; draft.version = null; draft.content.targets[0].target = "9999.00";
  p.revisions.unshift(draft, scheduled);
  p.events.push({ ...p.events[0], id: "e2", no: 2, revisionId: "rev2", effectiveAt: "2026-12-01T00:00:00.000Z" });
  const r = computeDiagnosticSnapshots(s, NOW).territories[0];
  assert.equal(r.targetAmount, 1000); assert.equal(r.basis?.kind === "published_plan" && r.basis.revisionId, "rev1");
  const later = computeDiagnosticSnapshots(s, new Date("2026-12-02T00:00:00Z")).territories[0];
  assert.equal(later.targetAmount, 2000); assert.notEqual(later.basis?.comparisonKey, r.basis?.comparisonKey);
});

test("no published target, non-revenue metrics and past or unknown periods create no attainment points", () => {
  const s = source();
  s.plans[0].events = [];
  assert.deepEqual(computeDiagnosticSnapshots(s, NOW).territories, []);
  for (const period of ["2026Q3", "2027Q1", "Custom"]) {
    const s = source(); s.plans[0].revisions[0].content.targets[0].period = period;
    assert.deepEqual(computeDiagnosticSnapshots(s, NOW).territories, []);
  }
  const s2 = source(); s2.plans[0].revisions[0].content.targets[0].metric = "pipeline";
  assert.deepEqual(computeDiagnosticSnapshots(s2, NOW).territories, []);
});

test("empty criteria do not match everybody; incomplete classification is recorded separately", () => {
  const s = source(); s.segments.push({ id: "empty", criteria: { industries: [], regions: [] } });
  s.accounts.push({ id: "missing", segmentId: "s1", industry: null, customerSize: null, region: null });
  const r = computeDiagnosticSnapshots(s, NOW);
  assert.equal(r.segments.at(-1)?.matchedAccountCount, 0);
  const basis = r.segments[0].basis;
  assert.equal(basis?.kind === "criteria" && basis.incompleteAccounts, 1);
});

test("changing the definition or global currency starts a new comparison basis", () => {
  const s = source(), first = computeDiagnosticSnapshots(s, NOW).segments[0];
  s.segments[0].criteria.industries = ["Manufacturing"];
  assert.notEqual(computeDiagnosticSnapshots(s, NOW).segments[0].basis?.comparisonKey, first.basis?.comparisonKey);
  s.currency = "USD";
  assert.equal(computeDiagnosticSnapshots(s, NOW).segments[0].currency, "USD");
});

test("an amount outside the numeric port's exact-cent range stays unknown instead of losing cents", () => {
  const s = source(); s.deals = [deal({ amount: "90071992547409.92" })];
  const r = computeDiagnosticSnapshots(s, NOW);
  assert.equal(r.segments[0].wonAmount, null);
  assert.equal(r.territories[0].attainedAmount, null);
});

test("the job records actual writes and continues after a workspace fails", async () => {
  const store = new InMemoryStrategyStore();
  const r = await runStrategySnapshots({ store, now: NOW, workspaces: [{ workspaceId: "bad" }, { workspaceId: "good" }], source: async ws => { if (ws === "bad") throw new Error("failed"); return source(); } });
  assert.deepEqual(r, { segmentSnapshots: 2, territorySnapshots: 1, workspacesProcessed: 1, failed: 1 });
  assert.equal((await store.listSegmentCoverageSnapshots("bad", 10)).length, 0);
  assert.equal((await store.listSegmentCoverageSnapshots("good", 10, { trustedOnly: true })).length, 2);
});
