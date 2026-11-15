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

test("margin defaults use each income tier, updates follow revenue, manual overrides survive", () => {
  let c = fixture();
  c = updatePlanningAmount(c, c.targets[0].key, "target", "1000");
  c = addPlanningMetric(c, "workspace", "margin");
  const margin = c.targets.find(
    (t) => t.metric === "margin" && t.period === "Y2028",
  )!;
  assert.deepEqual(
    [margin.floor, margin.target, margin.stretch],
    ["180.00", "400.00", "600.00"],
  );
  assert.deepEqual(
    c.targets
      .filter((t) => t.metric === "margin" && t.period !== "Y2028")
      .map((t) => t.target),
    ["40.00", "80.00", "120.00", "160.00"],
  );
  c = updatePlanningAmount(c, margin.key, "target", "450");
  c = updatePlanningAmount(c, c.targets[0].key, "target", "2000");
  const updated = c.targets.find((t) => t.key === margin.key)!;
  assert.deepEqual(
    [updated.floor, updated.target, updated.stretch],
    ["360.00", "450", "1200.00"],
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
