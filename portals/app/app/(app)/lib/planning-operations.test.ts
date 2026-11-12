import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyContent,
  validateContent,
  type CustomerContribution,
  type PlanAction,
  type TeamAllocation,
} from "../../domains/planning/plan-model";
import {
  excludePlanningRegion,
  missingPlanningQuarters,
  planningEntryLocked,
  planningReleaseTimeError,
  removePlanningTarget,
  validatePlanningAction,
  validatePlanningContribution,
  validatePlanningTeam,
} from "./planning-operations";

function fixture() {
  const c = emptyContent(
    2028,
    ["east", "west"].map((id) => ({
      id,
      divisionId: id,
      code: id,
      name: id,
      provinces: [],
      included: true,
      reason: "",
      ownerSub: null,
    })),
    "CNY",
  );
  for (const target of c.targets) target.target = "100";
  c.budgets.push({
    key: "budget",
    accountId: "account",
    name: "Customer",
    tier: "strategic",
    period: "Y2028",
    metric: "revenue",
    currency: "CNY",
    amount: "0.30",
    sourcePlanId: null,
    sourceReadAt: "2028-01-01T00:00:00Z",
    note: "Confirmed",
  });
  const contribution = (
    regionId: string,
    amount: string,
  ): CustomerContribution => ({
    key: regionId,
    regionId,
    budgetKey: "budget",
    targetKey: c.targets.find((line) => line.scope === `territory:${regionId}`)!
      .key,
    responsibility: "primary",
    amount,
  });
  c.contributions.push(
    contribution("east", "0.10"),
    contribution("west", "0.20"),
  );
  return c;
}
const team = (): TeamAllocation => ({
  key: "person",
  regionId: "east",
  memberSub: "person",
  memberName: "Person",
  unitId: null,
  unitName: "",
  role: "Sales",
  start: "2028-01-01",
  end: "2029-01-01",
  percent: 50,
  requestedFte: null,
  note: "",
});
const action = (): PlanAction => ({
  key: "action",
  regionId: "east",
  targetKey: null,
  accountId: "account",
  objective: "Visit customer",
  ownerSub: "person",
  due: "2028-04-01",
  evidenceRefs: ["evidence"],
});

test("annual metric removal cascades only its time breakdown and clears optional action references", () => {
  const c = fixture();
  c.budgets.push({
    ...c.budgets[0]!,
    key: "closed-quarter-budget",
    accountId: "another",
    period: "2028Q1",
  });
  const annual = {
    ...c.targets[0]!,
    key: "new-logo",
    metric: "new_logo" as const,
    currency: null,
  };
  const quarter = { ...annual, key: "new-logo-q1", period: "2028Q1" };
  c.targets.push(annual, quarter);
  c.actions.push({ ...action(), targetKey: c.targets[1]!.key });
  const next = removePlanningTarget(c, annual);
  assert.equal(
    next.targets.some((line) => line.metric === "new_logo"),
    false,
  );
  assert.equal(next.targets.length, 3);
  assert.equal(c.targets.length, 5);
  const regional = removePlanningTarget(c, c.targets[1]!);
  assert.equal(regional.actions[0]!.targetKey, null);
  assert.deepEqual(regional.actions[0]!.evidenceRefs, ["evidence"]);
  assert.equal(regional.budgets.length, 2);
  assert.ok(
    regional.budgets.some((budget) => budget.key === "closed-quarter-budget"),
  );
  assert.equal(regional.contributions.length, 1);
});

test("excluding a region preserves other regions and their shared customer budget", () => {
  const c = fixture();
  c.team.push(team());
  c.actions.push(action());
  const next = excludePlanningRegion(c, "east");
  assert.equal(
    next.targets.some((line) => line.scope === "territory:east"),
    false,
  );
  assert.deepEqual(
    next.contributions.map((line) => line.regionId),
    ["west"],
  );
  assert.equal(next.budgets.length, 1);
  assert.equal(next.actions.length + next.team.length, 0);
  assert.equal(next.regions[0]!.included, false);
  assert.equal(c.regions[0]!.included, true);
  assert.equal(excludePlanningRegion(next, "west").budgets.length, 0);
  validateContent(next, false);
});

test("quarter creation respects configured periods, existing rows and closed quarters", () => {
  const c = fixture();
  const q1 = { ...c.targets[0]!, key: "q1", period: "2028Q1" };
  c.targets.push(q1);
  c.periods = c.periods.filter((period) => period.key !== "2028Q4");
  const missing = missingPlanningQuarters(c, "workspace", ["2028Q2"]);
  assert.deepEqual(
    missing.map((line) => line.period),
    ["2028Q3"],
  );
  assert.equal(missing[0]!.target, null);
  c.targets.push(...missing.map((line) => ({ ...line, key: "q3" })));
  assert.deepEqual(missingPlanningQuarters(c, "workspace", ["2028Q2"]), []);
});

test("contribution editing excludes itself, enforces shared budgets with exact cents and rejects duplicates", () => {
  const c = fixture(),
    east = c.contributions[0]!;
  assert.doesNotThrow(() => validatePlanningContribution(c, east));
  assert.throws(
    () => validatePlanningContribution(c, { ...east, amount: "0.11" }),
    /budget_overallocated/,
  );
  assert.throws(
    () => validatePlanningContribution(c, { ...east, key: "duplicate" }),
    /duplicate_line/,
  );
  c.budgets[0]!.amount = "10";
  c.targets[1]!.target = "0.05";
  assert.throws(
    () => validatePlanningContribution(c, east),
    /contribution_overallocated/,
  );
  c.budgets[0]!.currency = "USD";
  assert.throws(
    () => validatePlanningContribution(c, east),
    /invalid_contribution/,
  );
});

test("resource and action validation rejects impossible dates and out-of-year inputs before closing the drawer", () => {
  const c = fixture();
  assert.doesNotThrow(() => validatePlanningTeam(c, team()));
  for (const patch of [
    { start: "2028-02-30" },
    { end: "2028-13-01" },
    { start: "2028-06-01", end: "2028-01-01" },
    { percent: 101 },
    { start: "2027-12-31" },
    { memberSub: null, requestedFte: "0" },
  ])
    assert.throws(
      () => validatePlanningTeam(c, { ...team(), ...patch }),
      /invalid_resource/,
    );
  assert.doesNotThrow(() => validatePlanningAction(c, action()));
  for (const patch of [
    { due: "2029-01-01" },
    { due: "2028-02-30" },
    { ownerSub: null },
    { objective: " " },
  ])
    assert.throws(
      () => validatePlanningAction(c, { ...action(), ...patch }),
      /invalid_action/,
    );
});

test("locked ranges keep annual targets editable and treat date boundaries as half-open", () => {
  const c = fixture(),
    locked = ["2028Q1"];
  assert.equal(planningEntryLocked(c, locked, c.targets[0]!), false);
  assert.equal(
    planningEntryLocked(c, locked, { ...c.targets[0]!, period: "2028Q1" }),
    true,
  );
  assert.equal(planningEntryLocked(c, locked, team()), true);
  assert.equal(
    planningEntryLocked(c, locked, { ...team(), start: "2028-04-01" }),
    false,
  );
  assert.equal(planningEntryLocked(c, locked, action()), false);
  assert.equal(
    planningEntryLocked(c, locked, { ...action(), due: "2028-03-31" }),
    true,
  );
});

test("scheduled publish rejects missing, expired and outside-year times without throwing", () => {
  const now = Date.parse("2028-06-01T00:00:00Z");
  for (const value of ["", "invalid"])
    assert.equal(planningReleaseTimeError(value, 2028, now), "invalid_period");
  assert.equal(
    planningReleaseTimeError("2028-06-01T00:00:00Z", 2028, now),
    "retroactive_release",
  );
  assert.equal(
    planningReleaseTimeError("2029-01-01T00:00:00Z", 2028, now),
    "effective_outside_period",
  );
  assert.equal(
    planningReleaseTimeError("2028-12-31T23:59:59Z", 2028, now),
    null,
  );
});
