import { test } from "node:test";
import assert from "node:assert/strict";
import { boardSourceFailed, launcherRevenueTargets, launcherAttainment, pendingQuoteOpportunities, readBoardSource } from "./launcher-metrics";
import { ok } from "../../domains/shared/result";
import type { TargetRecord } from "../../domains/planning/store";
const target = (patch: Partial<TargetRecord> = {}): TargetRecord => ({ id: "annual", workspaceId: "w", scopeType: "workspace", territoryId: null, ownerSub: null, period: "Y2027", metric: "revenue", targetValue: { unit: "money", amount: 20000000, currency: "CNY" }, status: "committed", planId: null, ...patch });
const now = new Date("2026-11-25T12:00:00Z");
test("revenue badge uses one period and hierarchy; auxiliary metrics cannot inflate it", () => {
  const rows = [target(), target({ id: "regional", scopeType: "territory", territoryId: "east" }), target({ id: "logos", metric: "new_logo", targetValue: { unit: "count", amount: 40 } })];
  assert.deepEqual(launcherRevenueTargets(rows, { kind: "workspace" }, now), [{ period: "Y2027", currency: "CNY", amount: 20000000 }]);
  assert.deepEqual(launcherRevenueTargets(rows, { kind: "own", sub: "someone", accountIds: [] }, now), []);
});
test("published revenue separates currencies, drafts and old targets", () => {
  const rows = [target({ period: "Y2025" }), target({ status: "draft" }), target({ targetValue: { unit: "money", amount: 100, currency: "USD" } }), target()];
  assert.equal(launcherRevenueTargets(rows, { kind: "workspace" }, now).length, 2);
  assert.deepEqual(launcherRevenueTargets(rows.slice(0,2), { kind: "workspace" }, now), []);
});
test("a failed source is unavailable while a measured empty list remains zero", async () => {
  const failed = await readBoardSource(async () => { throw new Error("private database detail"); });
  assert.equal(boardSourceFailed(failed), true);
  assert.equal(JSON.stringify(failed).includes("private"), false);
  const empty = await readBoardSource(async () => ok([]));
  assert.deepEqual(empty, ok([]));
  assert.equal(boardSourceFailed(empty), false);
});

test("quote approvals count visible deals once and exclude another member's lines", () => {
  const line = (opportunityId: string, approved = false) => ({ opportunityId, approved, needsApproval: true });
  assert.deepEqual(pendingQuoteOpportunities([line("visible"), line("visible"), line("foreign"), line("done", true)], [{ id: "visible" }, { id: "done" }]), ["visible"]);
});
test("attainment keeps personal and regional progress separate from company figures", () => {
  const row = (t: TargetRecord, amount: number) => ({ target: t, measurement: { kind: "measured" as const, achieved: { unit: "money" as const, currency: "CNY", amount }, ratio: amount / t.targetValue.amount } });
  const rows = [row(target(), 10000000), row(target({ id: "own", scopeType: "owner", ownerSub: "rep", targetValue: { unit: "money", currency: "CNY", amount: 100 } }), 150), row(target({ id: "east", scopeType: "territory", territoryId: "east", targetValue: { unit: "money", currency: "CNY", amount: 1000 } }), 250)];
  assert.equal(launcherAttainment(rows, { kind: "workspace" }, now)[0].ratio, .5);
  assert.equal(launcherAttainment(rows, { kind: "own", sub: "rep", accountIds: [] }, now)[0].ratio, 1.5);
  assert.equal(launcherAttainment(rows, { kind: "territory", territoryIds: ["east"], ownerSubs: [], accountIds: [], unplacedAccountIds: [] }, now)[0].ratio, .25);
  assert.deepEqual(launcherAttainment(rows, { kind: "own", sub: "foreign", accountIds: [] }, now), []);
});
test("missing measurements and mismatched currencies cannot create false progress", () => {
  const t = target({ scopeType: "territory", territoryId: "east" });
  const scope = { kind: "territory" as const, territoryIds: ["east", "west"], ownerSubs: [], accountIds: [], unplacedAccountIds: [] };
  const measured = { target: t, measurement: { kind: "measured" as const, achieved: { unit: "money" as const, currency: "CNY", amount: 500 }, ratio: 0 } };
  assert.deepEqual(launcherAttainment([measured, { target: { ...t, id: "west", territoryId: "west" }, measurement: { kind: "not_measurable", code: "no_snapshot" } }], scope, now), []);
  assert.deepEqual(launcherAttainment([{ ...measured, measurement: { ...measured.measurement, achieved: { ...measured.measurement.achieved, currency: "USD" } } }], scope, now), []);
  assert.deepEqual(launcherAttainment([{ ...measured, target: { ...t, targetValue: { unit: "money", currency: "CNY", amount: 0 } } }], scope, now), []);
});
