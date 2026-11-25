import { test } from "node:test";
import assert from "node:assert/strict";
import { boardSourceFailed, launcherRevenueTargets, readBoardSource } from "./launcher-metrics";
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
