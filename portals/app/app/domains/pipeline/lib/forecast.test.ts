import { test } from "node:test";
import assert from "node:assert/strict";
import { money } from "../../shared/money";
import { unwrap } from "../../shared/result";
import {
  FORECAST_CATEGORIES,
  accuracy,
  attainment,
  countNewLogos,
  inPeriod,
  inScope,
  isZero,
  openPipelineTotal,
  planCategoryChange,
  planSnapshot,
  rollUp,
  validateScope,
  type ForecastableOpportunity,
} from "./forecast";

const AT = new Date("2026-08-15T10:00:00Z");

function o(over: Partial<ForecastableOpportunity> = {}): ForecastableOpportunity {
  return {
    id: "opp",
    stage: "propose",
    forecastCategory: "pipeline",
    amount: money(100),
    territoryId: null,
    ownerSub: null,
    // Dated into 2026Q3 by default. Before TD-014 a fixture needed no date at
    // all, because nothing filtered by one; now an undated open deal is
    // excluded from every period, so an undated fixture would test exclusion
    // rather than whatever the test is about.
    expectedCloseAt: new Date("2026-09-15T00:00:00Z"),
    closedAt: null,
    ...over,
  };
}

test("the four categories match the spec", () => {
  assert.deepEqual([...FORECAST_CATEGORIES], ["pipeline", "best_case", "commit", "closed"]);
});

// --- Roll-up ----------------------------------------------------------------

test("each opportunity lands in exactly one bucket - the buckets do not nest", () => {
  // A best_case total that quietly contained commit would double-count against
  // a commit total shown beside it.
  const t = unwrap(
    rollUp([
      o({ id: "a", forecastCategory: "commit", amount: money(100) }),
      o({ id: "b", forecastCategory: "best_case", amount: money(50) }),
      o({ id: "c", forecastCategory: "pipeline", amount: money(25) }),
      o({ id: "d", forecastCategory: "closed", amount: money(10), stage: "won" }),
    ]),
  );
  assert.equal(t.commitAmount.amount, 100);
  assert.equal(t.bestCaseAmount.amount, 50);
  assert.equal(t.pipelineAmount.amount, 25);
  assert.equal(t.closedAmount.amount, 10);
});

test("money arithmetic is exact - no floating point drift in a total", () => {
  // 0.1 + 0.2 in floats is the canonical failure; a forecast that disagrees with
  // the sum of its own rows by a cent destroys trust in the whole number.
  const t = unwrap(
    rollUp([
      o({ forecastCategory: "commit", amount: money(0.1) }),
      o({ forecastCategory: "commit", amount: money(0.2) }),
    ]),
  );
  assert.equal(t.commitAmount.amount, 0.3);
});

test("an amount-less opportunity contributes zero rather than vanishing", () => {
  const t = unwrap(rollUp([o({ forecastCategory: "commit", amount: null })]));
  assert.equal(t.commitAmount.amount, 0);
});

test("mixed currencies are refused, never silently added", () => {
  const r = rollUp([
    o({ forecastCategory: "commit", amount: money(100, "CNY") }),
    o({ forecastCategory: "commit", amount: money(100, "USD") }),
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "currency_mismatch");
});

test("an unknown category is refused rather than dropped from the total", () => {
  const r = rollUp([o({ forecastCategory: "maybe" as never })]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "unknown_forecast_category");
});

test("openPipelineTotal names what it includes so nobody has to guess", () => {
  const t = unwrap(
    rollUp([
      o({ forecastCategory: "commit", amount: money(100) }),
      o({ forecastCategory: "best_case", amount: money(50) }),
      o({ forecastCategory: "pipeline", amount: money(25) }),
      o({ forecastCategory: "closed", amount: money(999), stage: "won" }),
    ]),
  );
  assert.equal(unwrap(openPipelineTotal(t)).amount, 175, "closed is not open pipeline");
});

// --- Scope ------------------------------------------------------------------

test("a scope carries exactly the key its type needs", () => {
  assert.ok(validateScope({ scopeType: "workspace", territoryId: null, ownerSub: null }).ok);
  assert.ok(validateScope({ scopeType: "territory", territoryId: "t1", ownerSub: null }).ok);
  assert.ok(validateScope({ scopeType: "owner", territoryId: null, ownerSub: "usr_1" }).ok);

  const missing = validateScope({ scopeType: "territory", territoryId: null, ownerSub: null });
  assert.equal(missing.ok === false && missing.violations[0].code, "scope_incomplete");

  const extra = validateScope({ scopeType: "workspace", territoryId: "t1", ownerSub: null });
  assert.equal(extra.ok === false && extra.violations[0].code, "scope_overspecified");

  const owned = validateScope({ scopeType: "owner", territoryId: "t1", ownerSub: "usr_1" });
  assert.equal(owned.ok === false && owned.violations[0].code, "scope_overspecified");
});

test("inScope filters by the scope's own key", () => {
  const rows = [
    o({ id: "a", territoryId: "t1", ownerSub: "usr_1" }),
    o({ id: "b", territoryId: "t2", ownerSub: "usr_2" }),
  ];
  assert.equal(inScope(rows, { scopeType: "workspace", territoryId: null, ownerSub: null }).length, 2);
  assert.deepEqual(
    inScope(rows, { scopeType: "territory", territoryId: "t1", ownerSub: null }).map((r) => r.id),
    ["a"],
  );
  assert.deepEqual(
    inScope(rows, { scopeType: "owner", territoryId: null, ownerSub: "usr_2" }).map((r) => r.id),
    ["b"],
  );
});

// --- Snapshot ---------------------------------------------------------------

test("a snapshot carries its scope, period and instant", () => {
  const row = unwrap(
    planSnapshot({
      period: "2026Q3",
      scope: { scopeType: "owner", territoryId: null, ownerSub: "usr_1" },
      opportunities: [o({ ownerSub: "usr_1", forecastCategory: "commit", amount: money(500) })],
      snapshotAt: AT,
    }),
  );
  assert.equal(row.period, "2026Q3");
  assert.equal(row.scopeType, "owner");
  assert.equal(row.ownerSub, "usr_1");
  assert.equal(row.territoryId, null);
  assert.equal(row.snapshotAt, AT);
  assert.equal(row.commitAmount.amount, 500);
});

test("a snapshot only rolls up what its scope covers", () => {
  const row = unwrap(
    planSnapshot({
      period: "2026Q3",
      scope: { scopeType: "owner", territoryId: null, ownerSub: "usr_1" },
      opportunities: [
        o({ ownerSub: "usr_1", forecastCategory: "commit", amount: money(100) }),
        o({ ownerSub: "usr_2", forecastCategory: "commit", amount: money(900) }),
      ],
      snapshotAt: AT,
    }),
  );
  assert.equal(row.commitAmount.amount, 100);
});

test("a snapshot needs a period", () => {
  const r = planSnapshot({
    period: "  ",
    scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
    opportunities: [],
  });
  assert.equal(r.ok === false && r.violations[0].code, "period_required");
});

test("an empty scope still produces a snapshot, of zeroes", () => {
  // A period where nothing was forecast is a fact worth recording; skipping the
  // row would leave a gap indistinguishable from "nobody submitted".
  const row = unwrap(
    planSnapshot({
      period: "2026Q4",
      scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
      opportunities: [],
      snapshotAt: AT,
    }),
  );
  assert.ok(isZero(row.commitAmount));
  assert.ok(isZero(row.closedAmount));
});

// --- Category changes -------------------------------------------------------

test("the three open categories move freely - that judgement is the rep's", () => {
  for (const to of ["pipeline", "best_case", "commit"] as const) {
    const r = planCategoryChange({ stage: "negotiate", forecastCategory: "pipeline" }, to);
    assert.ok(r.ok, `negotiate -> ${to}`);
  }
});

test("category is decoupled from stage - negotiate may still be best_case", () => {
  // Deriving the category from the stage would delete the disagreement that a
  // forecast review exists to surface.
  assert.ok(planCategoryChange({ stage: "negotiate", forecastCategory: "commit" }, "best_case").ok);
  assert.ok(planCategoryChange({ stage: "qualify", forecastCategory: "pipeline" }, "commit").ok);
});

test("closed and terminal stage must agree, in both directions", () => {
  const early = planCategoryChange({ stage: "propose", forecastCategory: "commit" }, "closed");
  assert.equal(early.ok === false && early.violations[0].code, "closed_requires_terminal_stage");

  const late = planCategoryChange({ stage: "won", forecastCategory: "closed" }, "commit");
  assert.equal(late.ok === false && late.violations[0].code, "terminal_requires_closed");

  assert.ok(planCategoryChange({ stage: "won", forecastCategory: "commit" }, "closed").ok);
});

// --- Derived measures -------------------------------------------------------

test("attainment is closed against target", () => {
  assert.equal(unwrap(attainment(money(750), money(1000))), 0.75);
});

test("no target is null, not zero - an unset quota is not a missed one", () => {
  assert.equal(unwrap(attainment(money(750), money(0))), null);
});

test("attainment refuses to compare across currencies", () => {
  const r = attainment(money(750, "CNY"), money(1000, "USD"));
  assert.equal(r.ok === false && r.violations[0].code, "currency_mismatch");
});

test("accuracy compares what actually closed against what was committed", () => {
  // Computable at all only because snapshots are never overwritten.
  assert.equal(unwrap(accuracy({ commitAmount: money(1000) }, money(900))), 0.9);
  assert.equal(unwrap(accuracy({ commitAmount: money(0) }, money(900))), null);
});

// Business rules section 2: `closed` means 已成交. The enum has no "lost"
// value, so a lost deal is filed under closed as well - and counting it as
// revenue reports money nobody ever won, which is the one direction a forecast
// must never be wrong in.
test("a lost deal contributes to no category, closed included", () => {
  const totals = unwrap(
    rollUp([
      { id: "won", stage: "won", forecastCategory: "closed", amount: money(500_000), territoryId: null, ownerSub: null, status: "won" },
      { id: "lost", stage: "lost", forecastCategory: "closed", amount: money(300_000), territoryId: null, ownerSub: null, status: "lost" },
    ]),
  );
  assert.equal(totals.closedAmount.amount, 500_000);
});

test("an opportunity with no status is treated as live - legacy rows still roll up", () => {
  const totals = unwrap(
    rollUp([
      { id: "a", stage: "negotiate", forecastCategory: "commit", amount: money(100_000), territoryId: null, ownerSub: null },
    ]),
  );
  assert.equal(totals.commitAmount.amount, 100_000);
});

// --- New logos (TD-013, ADR-020) --------------------------------------------

const won = (
  id: string,
  accountId: string,
  closedAt: string,
  over: Partial<ForecastableOpportunity> = {},
): ForecastableOpportunity => ({
  id,
  stage: "won",
  status: "won",
  forecastCategory: "closed",
  amount: money(100),
  territoryId: null,
  ownerSub: null,
  accountId,
  closedAt: new Date(closedAt),
  ...over,
});

const WS_SCOPE = { period: "2026Q3", scopeType: "workspace" as const, territoryId: null, ownerSub: null };

test("a new logo is an account won for the first time inside the period", () => {
  const all = [
    won("o1", "acc_a", "2026-07-10"),
    won("o2", "acc_b", "2026-08-02"),
    // Won last quarter: acc_c is not new in Q3.
    won("o3", "acc_c", "2026-05-01"),
  ];
  assert.equal(countNewLogos(all, "2026Q3", WS_SCOPE), 2);
});

test("a repeat sale to an existing customer is not a new logo", () => {
  // acc_a was broken in Q2. Selling to them again in Q3 does not re-acquire
  // them, and counting it would make new-customer growth indistinguishable
  // from upsell.
  const all = [won("o1", "acc_a", "2026-04-01"), won("o2", "acc_a", "2026-07-15")];
  assert.equal(countNewLogos(all, "2026Q3", WS_SCOPE), 0);
});

test("a customer cannot be new twice by being won in two territories", () => {
  // FIRST EVER is decided workspace-wide, then attributed to the scope of that
  // first deal. Deciding it per territory would let the company's new-customer
  // count exceed the number of customers it actually acquired.
  const all = [
    won("o1", "acc_a", "2026-07-01", { territoryId: "east" }),
    won("o2", "acc_a", "2026-08-01", { territoryId: "south" }),
  ];
  const east = { period: "2026Q3", scopeType: "territory" as const, territoryId: "east", ownerSub: null };
  const south = { period: "2026Q3", scopeType: "territory" as const, territoryId: "south", ownerSub: null };
  assert.equal(countNewLogos(all, "2026Q3", east), 1, "credit follows the deal that broke the account");
  assert.equal(countNewLogos(all, "2026Q3", south), 0);
  assert.equal(countNewLogos(all, "2026Q3", WS_SCOPE), 1, "and the workspace counts them once");
});

test("a lost deal never makes a new logo", () => {
  const all = [won("o1", "acc_a", "2026-07-10", { status: "lost" })];
  assert.equal(countNewLogos(all, "2026Q3", WS_SCOPE), 0);
});

test("an unparseable period yields null, not zero", () => {
  // "Nobody counted" and "counted, and the answer was none" are different
  // facts; the snapshot column is nullable for exactly this reason.
  assert.equal(countNewLogos([won("o1", "acc_a", "2026-07-10")], "FY26H1", WS_SCOPE), null);
});

test("a snapshot carries the count, and rollUp on its own does not invent one", () => {
  const all = [won("o1", "acc_a", "2026-07-10"), won("o2", "acc_b", "2026-05-01")];
  const row = unwrap(planSnapshot({ period: "2026Q3", scope: WS_SCOPE, opportunities: all }));
  assert.equal(row.newLogoCount, 1);
  // rollUp sees only the in-scope slice and cannot answer "first ever", so it
  // reports null rather than a count derived from a partial list.
  assert.equal(unwrap(rollUp(all)).newLogoCount, null);
});

// --- Period filtering (TD-014) ----------------------------------------------

test("a won deal belongs to the period it CLOSED in, not the one it was expected in", () => {
  // The two dates disagree all the time: a deal slips, then lands. What it
  // contributed to Q3 is decided by when it actually landed.
  const slipped = o({
    forecastCategory: "closed",
    stage: "won",
    status: "won",
    expectedCloseAt: new Date("2026-06-01"),
    closedAt: new Date("2026-07-20"),
  });
  assert.equal(inPeriod([slipped], "2026Q3")!.kept.length, 1);
  assert.equal(inPeriod([slipped], "2026Q2")!.kept.length, 0);
});

test("an open deal belongs to the period it is EXPECTED to close in", () => {
  const q4 = o({ forecastCategory: "commit", expectedCloseAt: new Date("2026-11-01") });
  assert.equal(inPeriod([q4], "2026Q3")!.kept.length, 0);
  assert.equal(inPeriod([q4], "2026Q4")!.kept.length, 1);
});

test("an undated open deal is in no period, and is counted rather than dropped", () => {
  // You cannot commit to a quarter a deal you have not dated. Excluding it
  // silently would make the total smaller than the list behind it with nothing
  // on screen to say why.
  const r = inPeriod([o({ expectedCloseAt: null })], "2026Q3")!;
  assert.equal(r.kept.length, 0);
  assert.equal(r.undated, 1);
});

test("a lost deal is neither kept nor counted as undated", () => {
  const r = inPeriod([o({ status: "lost", expectedCloseAt: null })], "2026Q3")!;
  assert.equal(r.kept.length, 0);
  assert.equal(r.undated, 0, "rollUp already ignores it; counting it would misdirect the reader");
});

test("an unparseable period filters nothing, and says so with null", () => {
  assert.equal(inPeriod([o()], "FY26H1"), null);
});

test("a snapshot rolls up only the period it names", () => {
  // The whole of TD-014: this row said 2026Q3 and contained every deal the
  // workspace had, including next quarter's.
  const row = unwrap(
    planSnapshot({
      period: "2026Q3",
      scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
      opportunities: [
        o({ id: "q3", forecastCategory: "commit", amount: money(100) }),
        o({ id: "q4", forecastCategory: "commit", amount: money(900), expectedCloseAt: new Date("2026-11-01") }),
      ],
      snapshotAt: AT,
    }),
  );
  assert.equal(row.commitAmount.amount, 100);
});

test("a snapshot refuses a period it cannot bound", () => {
  // An unfiltered snapshot is the defect. Refusing names the accepted forms so
  // the refusal is actionable.
  const r = planSnapshot({
    period: "FY26H1",
    scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
    opportunities: [o()],
  });
  assert.equal(r.ok === false && r.violations[0].code, "period_unparsed");
});

test("the whole-year tab is a period the snapshot accepts", () => {
  // (app)/lib/periods.ts offers Y2026 beside the quarters. A year label the
  // parser rejected would make that tab the one you cannot forecast from.
  const row = unwrap(
    planSnapshot({
      period: "Y2026",
      scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
      opportunities: [
        o({ forecastCategory: "commit", amount: money(100) }),
        o({ forecastCategory: "commit", amount: money(900), expectedCloseAt: new Date("2026-11-01") }),
      ],
      snapshotAt: AT,
    }),
  );
  assert.equal(row.commitAmount.amount, 1000);
});
