import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyContent, type PlanEvent, type PlanRevision, type SalesPlan } from "./plan-model";
import { strategyAdoptions, strategyAdoptionStatus } from "./strategy-adoption";
import { listStrategyAdoptions, type SalesPlanContext } from "./plan-service";
import { InMemorySalesPlanStore } from "./plan-store";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";

const now = "2026-11-26T08:00:00.000Z";
function revision(id: string, strategyId = "strategy-v1", state: PlanRevision["state"] = "sealed"): PlanRevision {
  const content = emptyContent(2026, [], "CNY");
  content.strategyAcceptances = ["revenue", "channels"].map(metric => ({ key: metric, strategyId, lineageId: "strategy",
    version: strategyId === "strategy-v1" ? 1 : 2, name: "Market expansion", period: "Y2026",
    expectation: { id: metric, metric: metric as "revenue" | "channels", amount: "100", currency: metric === "revenue" ? "CNY" : null, criterion: "" },
    amount: "100", ownerSub: null, note: "", allocations: [] }));
  return { id, state, editToken: 1, version: state === "draft" ? null : 1, baseId: null, restoresId: null, content,
    contentHash: null, reason: "", createdBy: "owner", createdAt: now, sealedBy: null, sealedAt: null };
}
function release(revisionId: string, no = 1, effectiveAt = "2026-01-01T00:00:00.000Z"): PlanEvent {
  return { id: `release-${revisionId}`, no, kind: "release", revisionId, relatedId: null, period: null,
    at: "2026-01-01T00:00:00.000Z", effectiveAt, actor: "owner", reason: "", requestKey: `r-${no}`, requestHash: "" };
}
function plan(revisions: PlanRevision[], events: PlanEvent[]): SalesPlan {
  return { id: "sales", workspaceId: "workspace", year: 2026, revisions, events, legacy: [] };
}
const strategy = { id: "strategy-v1", lineageId: "strategy", versionNo: 1 };

test("handoff counts current planning once per strategy despite multiple accepted objectives", () => {
  const sales = plan([revision("current")], [release("current")]);
  const rows = strategyAdoptions([sales], now, false);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.objectiveCount, 2);
  assert.equal(strategyAdoptionStatus(strategy, rows), "accepted");
  assert.equal(strategyAdoptionStatus(strategy, rows, 2027), "pending");
  assert.equal(strategyAdoptionStatus(strategy, rows, 2026), "accepted");
  assert.equal(strategyAdoptionStatus({ ...strategy, id: "strategy-v2", versionNo: 2 }, rows), "previous");
  assert.equal(strategyAdoptionStatus({ ...strategy, id: "revision-draft", versionNo: null }, rows), "unpublished");
  assert.equal("expectation" in rows[0], false);
  assert.equal("ownerSub" in rows[0], false);
});

test("superseded and canceled releases cannot leave a false accepted status", () => {
  const old = revision("old"), current = revision("current");
  current.content.strategyAcceptances = [];
  const sales = plan([old, current], [release("old"), release("current", 2, "2026-09-01T00:00:00.000Z")]);
  assert.equal(strategyAdoptionStatus(strategy, strategyAdoptions([sales], now, false)), "pending");
  sales.events.push({ ...release("cancel", 3), kind: "cancel", relatedId: "release-current" });
  assert.equal(strategyAdoptionStatus(strategy, strategyAdoptions([sales], now, false)), "accepted");
});

test("scheduled, draft and ended handoffs are distinguished from effective adoption", () => {
  const scheduled = plan([revision("scheduled")], [release("scheduled", 1, "2026-12-01T00:00:00.000Z")]);
  assert.equal(strategyAdoptionStatus(strategy, strategyAdoptions([scheduled], now, false)), "scheduled");
  const draft = plan([revision("draft", strategy.id, "draft")], []);
  assert.deepEqual(strategyAdoptions([draft], now, false), []);
  assert.equal(strategyAdoptionStatus(strategy, strategyAdoptions([draft], now, true)), "draft");
  const closed = plan([revision("current")], [release("current"), { ...release("close", 2), kind: "close" }]);
  assert.equal(strategyAdoptionStatus(strategy, strategyAdoptions([closed], now, true)), "closed");
  assert.equal(strategyAdoptionStatus({ ...strategy, id: "unpublished", versionNo: null }, []), "unpublished");
});

function context(sales: SalesPlan[]): SalesPlanContext {
  const store = new InMemorySalesPlanStore();
  store.seed(sales);
  return { workspaceId: "workspace", sub: "owner", holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, product: "yucer", workspace_id: "workspace", tier: "enterprise" },
    scope: { kind: "workspace" }, store, now: () => new Date(now) };
}

test("handoff read uses workspace isolation and independent planning/strategy/source permission gates", async () => {
  const visible = plan([revision("visible")], [release("visible")]);
  const foreign = { ...plan([revision("foreign")], [release("foreign")]), id: "foreign", workspaceId: "other" };
  const ctx = context([visible, foreign]);
  assert.deepEqual((await listStrategyAdoptions(ctx)).map(r => r.revisionId), ["visible"]);
  const permissions = new Set(ctx.holder.permissions);
  for (const permission of ["planning.read", "strategy.read"] as const) {
    ctx.holder = { permissions: new Set([...permissions].filter(p => p !== permission)) };
    await assert.rejects(listStrategyAdoptions(ctx));
  }
  ctx.holder = { permissions };
  ctx.scope = { kind: "own", sub: "owner", accountIds: [] };
  await assert.rejects(listStrategyAdoptions(ctx));
});

test("read-only members never receive unpublished handoffs", async () => {
  const ctx = context([plan([revision("draft", strategy.id, "draft")], [])]);
  ctx.holder = { permissions: new Set([...ctx.holder.permissions].filter(p => p !== "planning.write")) };
  assert.deepEqual(await listStrategyAdoptions(ctx), []);
  const hidden = revision("source-hidden");
  hidden.content.budgets = [{ accountId: "private" }] as typeof hidden.content.budgets;
  const hiddenCtx = context([plan([hidden], [release(hidden.id)])]);
  hiddenCtx.holder = { permissions: new Set([...hiddenCtx.holder.permissions].filter(p => p !== "account.read")) };
  await assert.rejects(listStrategyAdoptions(hiddenCtx));
});
