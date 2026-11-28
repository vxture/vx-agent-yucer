import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analysisRow,
  customerComposition,
  customerProjects,
  rollingDifferences,
  tierProgress,
  verifiedNewLogos,
  type AnalysisAccount,
  type AnalysisDeal,
} from "./attainment-analysis";
import type { AttainmentMetricTarget } from "../../planning/attainment-plan";
import type { CooperationAssertion } from "../../account/lib/cooperation";
const account = (id: string, ownerSub = "rep"): AnalysisAccount => ({
  id,
  name: id,
  accountNo: id,
  ownerSub,
  status: "active",
  tier: "standard",
  regionId: "east",
});
const history = (
  id: string,
  date: string,
  over: Partial<CooperationAssertion> = {},
): CooperationAssertion => ({
  id,
  accountId: id,
  state: "dated",
  firstDate: date,
  beforeYear: null,
  acquisitionOwnerSub: null,
  acquisitionTerritoryId: null,
  evidence: "Contract verified",
  recordedAt: "2026-11-01T00:00:00Z",
  recordedBy: "ops",
  requestKey: id,
  ...over,
});
const target = (
  period = "Y2026",
  over: Partial<AttainmentMetricTarget> = {},
): AttainmentMetricTarget => ({
  key: period,
  period,
  scope: "workspace",
  metric: "revenue",
  currency: "CNY",
  floor: 70,
  target: 100,
  stretch: 140,
  baseline: null,
  baselineComparable: false,
  source: "sales_plan",
  revision: null,
  ...over,
});
const deal = (over: Partial<AnalysisDeal> = {}): AnalysisDeal => ({
  id: "p1",
  opportunityNo: "OPP-1",
  name: "Project",
  accountId: "a",
  ownerSub: "rep",
  territoryId: "east",
  status: "won",
  stage: "won",
  forecastCategory: "closed",
  amount: { amount: 80, currency: "CNY" },
  currency: "CNY",
  expectedCloseAt: "2026-02-01T00:00:00Z",
  closedAt: "2026-02-02T00:00:00Z",
  ...over,
});
const row = (
  period = "Y2026",
  deals: AnalysisDeal[] | null = [deal()],
  targets = [target(period)],
) =>
  analysisRow({
    scope: "workspace",
    name: "Company",
    period,
    currency: "CNY",
    targets,
    deals,
    observedAt: "2026-11-01T00:00:00Z",
  });
test("zero, unknown, failure and currency conflicts remain different facts", () => {
  assert.equal(row("Y2026", []).closed.value, 0);
  assert.equal(row("Y2026", null).closed.state, "failed");
  assert.equal(row("Y2026", [deal({ amount: null })]).closed.state, "unknown");
  assert.equal(
    row("Y2026", [deal({ amount: { amount: 5, currency: "USD" } })]).closed
      .state,
    "currency_conflict",
  );
  assert.equal(row("Y2026", [deal({ amount: null })]).rate, null);
});
test("period and ownership apply before monetary rollup; no annual or shared target invented", () => {
  const result = row("2026Q1", [
    deal(),
    deal({
      id: "future",
      closedAt: "2026-05-01T00:00:00Z",
      amount: { amount: 500, currency: "CNY" },
    }),
  ]);
  assert.equal(result.closed.value, 80);
  assert.equal(result.difference, -20);
  assert.equal(row("2026Q1", [deal()], [target()]).target, null);
  const own = analysisRow({
    scope: "owner:other",
    name: "Other",
    period: "Y2026",
    currency: "CNY",
    targets: [target()],
    deals: [deal()],
    observedAt: "2026-11-01",
  });
  assert.equal(own.closed.value, 0);
  assert.equal(own.target, null);
});
test("tiers use exact configured thresholds and leave visible headroom", () => {
  const scale = tierProgress(110, target())!;
  assert.equal(scale.stage, "target");
  assert.deepEqual(
    scale.marks.map((m) => m.value),
    [70, 100, 140],
  );
  assert.ok(scale.marks[2]!.position > 90 && scale.marks[2]!.position < 95);
  assert.equal(
    tierProgress(60, { floor: null, target: 100, stretch: null })!.marks.length,
    1,
  );
  assert.equal(tierProgress(null, target()), null);
});
test("carry uses actual minus target and stops at an unknown settled quarter", () => {
  const rows = [
    row("2026Q1"),
    row("2026Q2", [
      deal({
        closedAt: "2026-05-01T00:00:00Z",
        amount: { amount: 130, currency: "CNY" },
      }),
    ]),
    row("2026Q3", [], []),
    row("2026Q4", []),
  ];
  const carry = rollingDifferences(rows, true, "2027-01-01T00:00:00Z");
  assert.deepEqual(
    carry.map((c) => c.effective),
    [-20, 10, null, null],
  );
  assert.deepEqual(
    rollingDifferences(rows, false, "2027-01-01T00:00:00Z").map(
      (c) => c.incoming,
    ),
    [0, 0, 0, 0],
  );
  assert.equal(rows[1]!.difference, 30);
});
test("carry cannot skip a missing period or pass through a quarter still in progress", () => {
  const skipped = rollingDifferences(
    [row("2026Q1"), row("2026Q3")],
    true,
    "2026-11-01T00:00:00Z",
  );
  assert.equal(skipped[1]!.effective, null);
  const current = rollingDifferences(
    [row("2026Q1"), row("2026Q2"), row("2026Q3")],
    true,
    "2026-05-01T00:00:00Z",
  );
  assert.equal(current[1]!.incoming, -20);
  assert.equal(current[2]!.incoming, 0);
});
test("customer vintage is real cooperation; registration and owner changes cannot create acquisitions", () => {
  const accounts = [
    account("old"),
    account("new"),
    account("unknown"),
    account("prospect"),
  ];
  const histories = [
    history("old", "2010-03-01"),
    history("new", "2026-07-01"),
    history("prospect", "2026-01-01", { state: "never", firstDate: null }),
  ];
  const annual = customerComposition({
    accounts,
    history: histories,
    year: 2026,
    period: "Y2026",
    observedAt: "2026-11-01",
  })!;
  const q1 = customerComposition({
    accounts,
    history: histories,
    year: 2026,
    period: "2026Q1",
    observedAt: "2026-11-01",
  })!;
  assert.deepEqual({ ...q1, added: annual.added }, annual);
  assert.equal(annual.added, 1);
  assert.equal(q1.added, 0);
  assert.equal(annual.old, 1);
  assert.equal(annual.unknown, 1);
  assert.equal(annual.prospect, 1);
  assert.equal(
    customerComposition({
      accounts,
      history: histories,
      year: 2025,
      period: "Y2025",
      observedAt: "2026-11-01",
    }),
    null,
  );
});
test("new cooperation attribution never falls back to current customer or project owner", () => {
  const accounts = [account("a")],
    histories = [history("a", "2026-03-01")];
  assert.equal(
    verifiedNewLogos(histories, accounts, "workspace", "Y2026").value,
    1,
  );
  assert.equal(
    verifiedNewLogos(histories, accounts, "owner:rep", "Y2026").value,
    null,
  );
  assert.equal(
    verifiedNewLogos(
      [history("a", "2026-03-01", { acquisitionOwnerSub: "former" })],
      accounts,
      "owner:rep",
      "Y2026",
    ).value,
    0,
  );
  assert.equal(
    verifiedNewLogos([], accounts, "workspace", "Y2026").value,
    null,
  );
});
test("one customer keeps distinct project owners and actionable undated projects", () => {
  const projects = [
    deal({ status: "open", ownerSub: "rep" }),
    deal({
      id: "p2",
      status: "open",
      ownerSub: "other",
      expectedCloseAt: null,
    }),
  ];
  const groups = customerProjects(
    [account("a")],
    projects,
    "rep",
    "workspace",
    "Y2026",
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.owned.length, 1);
  assert.equal(groups[0]!.other.length, 1);
  assert.equal(row("Y2026", projects).open.value, 80);
  assert.equal(row("Y2026", projects).undated, 1);
  assert.equal(
    customerProjects([], projects, "rep", "workspace", "Y2026").length,
    0,
  );
});

test("diagnosis priority and duplicate customer identities have a locale-independent render order", () => {
  const accounts = [
    { ...account("star"), name: "\u661f\u6cb3" },
    { ...account("ink-b"), name: "\u58a8\u5ddd" },
    { ...account("risk"), name: "Zulu" },
    { ...account("ink-a"), name: "\u58a8\u5ddd" },
  ];
  const projects = accounts.map((a) =>
    deal({
      id: a.id,
      accountId: a.id,
      status: "open",
      expectedCloseAt: a.id === "risk" ? null : "2026-12-01T00:00:00Z",
    }),
  );
  const order = (rows: AnalysisDeal[]) =>
    customerProjects(accounts, rows, "rep", "workspace", "Y2026").map(
      (g) => g.account.id,
    );
  assert.deepEqual(order(projects), ["risk", "ink-a", "ink-b", "star"]);
  assert.deepEqual(order([...projects].reverse()), order(projects));
});

test("unknown historical upper bounds never imply zero acquisitions; hidden accounts are excluded", () => {
  const h = history("a", "2026-01-01", {
    state: "before_year",
    firstDate: null,
    beforeYear: 2026,
  });
  assert.equal(
    verifiedNewLogos([h], [account("a")], "workspace", "Y2024").value,
    null,
  );
  assert.equal(
    verifiedNewLogos(
      [history("hidden", "2026-01-01")],
      [],
      "workspace",
      "Y2026",
    ).value,
    0,
  );
  assert.equal(
    verifiedNewLogos(
      [history("a", "2026-01-01", { acquisitionOwnerSub: "former" })],
      [account("a")],
      "owner:former",
      "Y2026",
    ).value,
    1,
  );
});

test("an undated win cannot imply zero current-period sales or a settled carry", () => {
  const r = row("2026Q1", [deal({ closedAt: null })]);
  assert.equal(r.closed.state, "unknown");
  assert.equal(r.closed.value, null);
  assert.equal(r.difference, null);
  assert.equal(
    rollingDifferences([r, row("2026Q2")], true, "2026-11-01")[1]!.effective,
    null,
  );
});
