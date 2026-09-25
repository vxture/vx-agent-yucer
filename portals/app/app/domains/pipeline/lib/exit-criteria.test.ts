import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkStage, planCriterion, type DealFacts, type ExitCriterion } from "./exit-criteria";
import { DEFAULT_EXIT_CRITERIA } from "./exit-criteria-vocab";

const NOW = new Date("2026-09-25T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const criteria: ExitCriterion[] = DEFAULT_EXIT_CRITERIA.map((d, i) => ({ id: `c${i}`, ...d }));
const facts = (over: Partial<DealFacts> = {}): DealFacts => ({
  people: [{ role: "economic", lastContactAt: days(10) }, { role: "user", lastContactAt: null }],
  filledSlots: new Set(["pain", "decision_process"]),
  lines: { count: 3, pending: 1 },
  theirOverdue: 1,
  expectedCloseAt: new Date("2026-11-09T00:00:00Z"),
  now: NOW,
  ...over,
});

test("each kind judges its own fact; the count is met over configured", () => {
  const v = checkStage("validate", criteria, facts());
  assert.deepEqual(v.checks.map((c) => c.status), ["met", "unmet", "met"]);
  assert.equal(v.met, 2);
  assert.equal(v.total, 3);
  const n = checkStage("negotiate", criteria, facts());
  assert.deepEqual(n.checks.map((c) => [c.criterion.kind, c.status]), [
    ["lines_priced", "unmet"],
    ["close_date_valid", "met"],
    ["their_commitments_clear", "unmet"],
  ]);
  assert.deepEqual(n.checks[1].detail, { kind: "close_date_valid", daysLeft: 45 });
});

test("a refused read is unknown - never met; an unconfigured stage has zero, not all", () => {
  const v = checkStage("validate", criteria, facts({ people: null, filledSlots: null }));
  assert.deepEqual(v.checks.map((c) => c.status), ["unknown", "unknown", "unknown"]);
  assert.equal(v.met, 0);
  assert.deepEqual(checkStage("won", criteria, facts()), { checks: [], met: 0, total: 0 });
});

test("reached means within the window; anyone-on-the-deal needs just one person", () => {
  const late = checkStage("validate", criteria, facts({ people: [{ role: "economic", lastContactAt: days(31) }] }));
  assert.equal(late.checks[0].status, "unmet");
  const q = checkStage("qualify", criteria, facts({ people: [{ role: "unknown", lastContactAt: null }] }));
  assert.equal(q.checks[1].status, "met");
});

test("a criterion's parameters are checked per kind before it is written", () => {
  assert.equal(planCriterion({ kind: "role_reached", param: { roles: ["economic"], days: 30 }, name: "x" }).ok, true);
  for (const bad of [
    { kind: "role_reached", param: { roles: [], days: 30 } },
    { kind: "role_reached", param: { roles: ["economic"], days: 0 } },
    { kind: "role_present", param: { roles: ["ceo"] } },
    { kind: "slot_filled", param: { slot: "budget" } },
  ]) {
    const r = planCriterion({ ...bad, name: "x" });
    assert.equal(r.ok === false && r.violations[0].code, "criterion_param_invalid", JSON.stringify(bad));
  }
  const k = planCriterion({ kind: "vibes", param: {}, name: "x" });
  assert.equal(k.ok === false && k.violations[0].code, "criterion_kind_unknown");
  const n = planCriterion({ kind: "lines_priced", param: {}, name: "  " });
  assert.equal(n.ok === false && n.violations[0].code, "name_required");
});

test("the code seed and incr/0087's seed are the same rows", () => {
  const sql = readFileSync(join(process.cwd(), "..", "..", "deploy/database/ddl/incr/0087_stage_exit_criterion.sql"), "utf8");
  const rows = [...sql.matchAll(/\('(\w+)',\s*'(\w+)',\s*'(\{[^']*\})',\s*'([^']+)',\s*(\d+)\)/g)].map((m) => [
    m[1], m[2], JSON.stringify(JSON.parse(m[3]!)), m[4], Number(m[5]),
  ]);
  assert.deepEqual(
    rows,
    DEFAULT_EXIT_CRITERIA.map((d) => [d.stageCode, d.kind, JSON.stringify(d.param), d.name, d.sortOrder]),
  );
});
