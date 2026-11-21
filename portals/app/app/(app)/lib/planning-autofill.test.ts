import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyContent,
  minor,
  validateContent,
} from "../../domains/planning/plan-model";
import {
  addPlanningMetric,
  autofillPlanningQuarters,
  autofillPlanningRegions,
  updatePlanningAmount,
  updatePlanningMarginRate,
} from "./planning-autofill";
function fixture() {
  return emptyContent(2028, [], "CNY");
}
test("one annual input fills the ladder and four exact quarterly totals", () => {
  let c = fixture();
  c.releaseScope = "company";
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000000");
  assert.deepEqual(
    [c.targets[0].floor, c.targets[0].target, c.targets[0].stretch],
    ["600000.00", "1000000", "1200000.00"],
  );
  assert.deepEqual(
    c.targets.slice(1).map((t) => t.target),
    ["100000.00", "200000.00", "300000.00", "400000.00"],
  );
  validateContent(c, true);
});
test("tier overrides recalculate percentages without changing the formal target", () => {
  let c = fixture();
  const key = c.targets[0].key;
  c = updatePlanningAmount(c, key, "target", "1000");
  c = updatePlanningAmount(c, key, "floor", "750");
  assert.equal(c.targets[0].target, "1000");
  assert.equal(c.targets[0].floor, "750");
  assert.ok(
    c.targets.slice(1).every((t) => t.floor === null && t.stretch === null),
  );
});
test("Q4 follows cumulative Q1-Q3 edits and never hides over-allocation", () => {
  let c = fixture();
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000");
  c = updatePlanningAmount(c, c.targets[1].key, "target", "150");
  assert.equal(c.targets[4].target, "350.00");
  c = updatePlanningAmount(c, c.targets[1].key, "target", "1100");
  assert.throws(() => validateContent(c, true), /overallocated/);
});
test("integer customer counts retain ladders and exact annual sums at small totals", () => {
  for (let total = 1; total < 40; total++) {
    let c = addPlanningMetric(fixture(), "workspace", "new_logo");
    const annual = c.targets.find(
      (t) => t.metric === "new_logo" && t.period === "Y2028",
    )!;
    c = updatePlanningAmount(c, annual.key, "target", String(total));
    const rows = c.targets.filter(
      (t) => t.metric === "new_logo" && t.period !== "Y2028",
    );
    for (const t of rows) {
      assert.equal(t.floor, null);
      assert.equal(t.stretch, null);
      assert.equal(minor(t.target!) % 100n, 0n);
    }
    assert.equal(
      rows.reduce((n, t) => n + minor(t.target!), 0n),
      minor(c.targets.find((t) => t.key === annual.key)!.target!),
    );
  }
});
test("locked quarters survive annual reallocation, including explicit zero", () => {
  let c = fixture();
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000");
  const before = structuredClone(c.targets[1]);
  c = updatePlanningAmount(c, c.targets[0].key, "target", "2000", ["2028Q1"]);
  assert.deepEqual(c.targets[1], before);
  c = updatePlanningAmount(c, c.targets[0].key, "target", "0", ["2028Q1"]);
  assert.deepEqual(c.targets[1], before);
  assert.throws(() => validateContent(c, true), /overallocated/);
});
test("regions preserve company quarterly caps, ladders, and exact minor units", () => {
  for (let total = 1; total < 25; total++) {
    let c = fixture();
    c = updatePlanningAmount(
      c,
      c.targets[0].key,
      "target",
      String(total / 100),
    );
    c.regions = ["a", "b", "c"].map((id) => ({
      id,
      divisionId: id,
      code: id,
      name: id,
      provinces: [],
      included: true,
      reason: "",
      ownerSub: null,
    }));
    c = autofillPlanningRegions(c);
    validateContent(c, true);
    for (const company of c.targets.filter((t) => t.scope === "workspace"))
      for (const tier of (company.period === "Y2028"
        ? ["floor", "target", "stretch"]
        : ["target"]) as ("floor" | "target" | "stretch")[])
        assert.equal(
          c.targets
            .filter(
              (t) => t.scope !== "workspace" && t.period === company.period,
            )
            .reduce((n, t) => n + minor(t[tier]!), 0n),
          minor(company[tier]!),
        );
  }
});
test("existing regional amounts are never silently overwritten", () => {
  let c = fixture();
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000");
  c.regions = [
    {
      id: "a",
      divisionId: "a",
      code: "a",
      name: "a",
      provinces: [],
      included: true,
      reason: "",
      ownerSub: null,
    },
  ];
  c = autofillPlanningRegions(c);
  c.targets.find((t) => t.scope !== "workspace")!.target = "123";
  assert.deepEqual(autofillPlanningRegions(c), c);
});

test("margin rates use baseline revenue and custom rate settings survive revenue changes", () => {
  let c = fixture();
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000");
  c = addPlanningMetric(c, "workspace", "margin");
  const margin = c.targets.find(
    (t) => t.metric === "margin" && t.period === "Y2028",
  )!;
  assert.deepEqual(
    [margin.floor, margin.target, margin.stretch],
    ["300.00", "400.00", "500.00"],
  );
  assert.deepEqual(
    c.targets
      .filter((t) => t.metric === "margin" && t.period !== "Y2028")
      .map((t) => t.target),
    ["40.00", "80.00", "120.00", "160.00"],
  );
  c = updatePlanningMarginRate(c, margin.key, "target", "45");
  c = updatePlanningAmount(c, c.targets[0].key, "target", "2000");
  const updated = c.targets.find((t) => t.key === margin.key)!;
  assert.deepEqual(
    [updated.floor, updated.target, updated.stretch],
    ["600.00", "900.00", "1000.00"],
  );
});
test("all auxiliary quarters follow edited revenue timing, with Q4 retaining the exact balance", () => {
  let c = fixture();
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000");
  c = addPlanningMetric(c, "workspace", "new_logo");
  c = updatePlanningAmount(
    c,
    c.targets.find((t) => t.metric === "new_logo" && t.period === "Y2028")!.key,
    "target",
    "20",
  );
  c = addPlanningMetric(c, "workspace", "pipeline");
  c = updatePlanningAmount(
    c,
    c.targets.find((t) => t.metric === "pipeline" && t.period === "Y2028")!.key,
    "target",
    "3000",
  );
  c = addPlanningMetric(c, "workspace", "margin");
  c = updatePlanningAmount(
    c,
    c.targets.find((t) => t.metric === "revenue" && t.period === "2028Q1")!.key,
    "target",
    "200",
  );
  for (const [metric, expected] of [
    ["new_logo", ["4", "4", "6", "6"]],
    ["pipeline", ["600.00", "600.00", "900.00", "900.00"]],
    ["margin", ["80.00", "80.00", "120.00", "120.00"]],
  ] as const) {
    const rows = c.targets.filter(
      (t) => t.metric === metric && t.period !== "Y2028",
    );
    assert.deepEqual(
      rows.map((t) => t.target),
      expected,
    );
    assert.ok(rows.every((t) => t.floor === null && t.stretch === null));
  }
});

test("new company metrics auto-allocate without changing existing regional revenue", () => {
  let c = fixture();
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000");
  c.regions = ["a", "b"].map((id) => ({
    id,
    divisionId: id,
    code: id,
    name: id,
    provinces: [],
    included: true,
    reason: "",
    ownerSub: null,
  }));
  c = autofillPlanningRegions(c);
  const before = structuredClone(
    c.targets.filter((t) => t.scope !== "workspace"),
  );
  c = addPlanningMetric(c, "workspace", "margin");
  c = autofillPlanningRegions(c);
  assert.deepEqual(
    c.targets.filter((t) => t.scope !== "workspace" && t.metric === "revenue"),
    before,
  );
  assert.equal(
    c.targets
      .filter(
        (t) =>
          t.scope !== "workspace" &&
          t.metric === "margin" &&
          t.period === "Y2028",
      )
      .reduce((n, t) => n + minor(t.target!), 0n),
    40000n,
  );
  validateContent(c, true);
});

test("margin rates use one baseline, survive zero revenue and remain constant across ordinary quarters", () => {
  let c = fixture();
  c.releaseScope = "company";
  c = addPlanningMetric(c, "workspace", "margin");
  const key = c.targets.find(
    (t) => t.metric === "margin" && t.period === "Y2028",
  )!.key;
  c = updatePlanningMarginRate(c, key, "target", "42.5");
  assert.equal(
    c.targets.find((t) => t.key === key)!.marginRates!.target,
    "42.5",
  );
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000000");
  assert.deepEqual(
    [
      c.targets.find((t) => t.key === key)!.floor,
      c.targets.find((t) => t.key === key)!.target,
      c.targets.find((t) => t.key === key)!.stretch,
    ],
    ["300000.00", "425000.00", "500000.00"],
  );
  validateContent(c, true);
  const quarters = c.targets.filter(
    (t) => t.metric === "margin" && t.period !== "Y2028",
  );
  assert.deepEqual(
    quarters.map((t) => t.target),
    ["42500.00", "85000.00", "127500.00", "170000.00"],
  );
  assert.ok(quarters.every((t) => !t.marginRates));
  c = updatePlanningAmount(c, c.targets[0].key, "target", "0");
  assert.equal(
    c.targets.find((t) => t.key === key)!.marginRates!.target,
    "42.5",
  );
  assert.equal(c.targets.find((t) => t.key === key)!.target, "0.00");
  validateContent(c, true);
});
test("invalid rate and forged derived amount cannot publish", () => {
  let c = fixture();
  c.releaseScope = "company";
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000");
  c = addPlanningMetric(c, "workspace", "margin");
  const key = c.targets.find(
    (t) => t.metric === "margin" && t.period === "Y2028",
  )!.key;
  assert.throws(
    () =>
      validateContent(updatePlanningMarginRate(c, key, "target", "101"), false),
    /invalid_margin_rate/,
  );
  const forged = structuredClone(c);
  forged.targets.find((t) => t.key === key)!.target = "401";
  assert.throws(() => validateContent(forged, false), /margin_rate_mismatch/);
  const locked = structuredClone(
    c.targets.find((t) => t.metric === "margin" && t.period === "2028Q1")!,
  );
  c = updatePlanningMarginRate(c, key, "target", "45", ["2028Q1"]);
  assert.deepEqual(
    c.targets.find((t) => t.key === locked.key),
    locked,
  );
  validateContent(c, true);
});
test("pipeline defaults to three times baseline revenue and preserves adjusted coverage", () => {
  let c = fixture();
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000");
  c = addPlanningMetric(c, "workspace", "pipeline");
  const key = c.targets.find(
    (t) => t.metric === "pipeline" && t.period === "Y2028",
  )!.key;
  assert.equal(c.targets.find((t) => t.key === key)!.target, "3000.00");
  c = updatePlanningAmount(c, key, "target", "4000");
  c = updatePlanningAmount(c, c.targets[0].key, "target", "2000");
  assert.deepEqual(
    [
      c.targets.find((t) => t.key === key)!.floor,
      c.targets.find((t) => t.key === key)!.target,
      c.targets.find((t) => t.key === key)!.stretch,
    ],
    ["4800.00", "8000.00", "9600.00"],
  );
});
