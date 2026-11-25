import { test } from "node:test";
import assert from "node:assert/strict";
import { companyHandoffSummary, toggleCompanyStrategy, type CompanyHandoffDraft } from "./company-handoff";
import type { StrategyAcceptance } from "../../domains/planning/strategy-handoff";
const row = (key: string, strategyId: string, amount = "100"): StrategyAcceptance => ({ key, strategyId, lineageId: strategyId, version: 1, name: strategyId, period: "2027", expectation: { id: key, metric: "revenue", amount: "100", currency: "CNY", criterion: "Contract signed" }, amount, ownerSub: null, note: "", allocations: [] });
test("selecting a second strategy preserves prior edits, owner and other selected strategies", () => {
  const first = { ...row("a", "first", "80"), ownerSub: "owner", note: "Agreed scope" };
  const draft: CompanyHandoffDraft = { active: "first", choices: [first, row("b", "second")], selected: ["a"] };
  const next = toggleCompanyStrategy(draft, "second", true, []);
  assert.deepEqual(next.selected, ["a", "b"]);
  assert.deepEqual(next.choices[0], first);
  assert.deepEqual(draft.selected, ["a"]);
  assert.deepEqual(companyHandoffSummary(next).totals.map(t => t.amount), ["180.00"]);
  assert.equal(companyHandoffSummary(next).strategies, 2);
});
test("strategy deselection retains locked commitments and never touches another strategy", () => {
  const a = row("a", "first"); a.allocations = [{ key: "alloc", regionId: "east", period: "2027Q1", amount: "50", ownerSub: null }];
  const draft = { active: "first", choices: [a, row("b", "first"), row("c", "second")], selected: ["a", "b", "c"] };
  assert.deepEqual(toggleCompanyStrategy(draft, "first", false, ["2027Q1"]).selected, ["a", "c"]);
  assert.deepEqual(toggleCompanyStrategy(draft, "first", true, []).selected, ["a", "b", "c"]);
});
test("incomplete amount input never crashes the multi-strategy summary", () => {
  const draft = { active: "first", choices: [row("a", "first", "invalid")], selected: ["a"] };
  assert.equal(companyHandoffSummary(draft).invalid, true);
});
