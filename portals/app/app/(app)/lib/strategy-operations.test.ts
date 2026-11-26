import { test } from "node:test";
import assert from "node:assert/strict";
import { strategyOperations } from "./strategy-operations";
import type { PlanRecord } from "../../domains/strategy/store";

const all = { canEdit: true, canApprove: true };
const readOnly = { canEdit: false, canApprove: false };
const plan = (patch: Partial<PlanRecord> = {}): PlanRecord => ({ id: "v1", workspaceId: "w", lineageId: "v1", basePlanId: null,
  versionNo: 1, status: "active", name: "Strategy", planNo: "STR-20261126-001", period: "2027", objective: null,
  ownerSub: null, approvedAt: null, solutionIds: [], ...patch });

test("initial drafts offer editing and publication by independent permissions, without empty history or execution", () => {
  const p = plan({ status: "draft", versionNo: null });
  const editor = strategyOperations(p, [p], { canEdit: true, canApprove: false });
  assert.deepEqual(editor.actions, ["view", "edit", "discard"]);
  assert.equal(editor.primary, "edit");
  const approver = strategyOperations(p, [p], { canEdit: false, canApprove: true });
  assert.deepEqual(approver.actions, ["view", "publish"]);
  assert.equal(approver.primary, "publish");
  assert.equal(strategyOperations(p, [p], all).detailPrimary, "publish");
  assert.deepEqual(strategyOperations(p, [p], readOnly).actions, ["view"]);
});

test("published strategies start execution before revision, active strategies revise once and resume the same draft", () => {
  const ready = plan({ status: "approved" });
  assert.equal(strategyOperations(ready, [ready], all).primary, "active");
  const current = plan();
  assert.equal(strategyOperations(current, [current], all).primary, "revise");
  const draft = plan({ id: "draft", status: "draft", basePlanId: current.id, versionNo: null });
  const operations = strategyOperations(current, [current, draft], all);
  assert.equal(operations.primary, "resume");
  assert.equal(operations.draftId, draft.id);
  assert.equal(operations.actions.includes("revise"), false);
  assert.equal(strategyOperations(draft, [current, draft], all).staleDraft, false);
});

test("superseded versions remain read-only while latest ended and archived strategies expose only legal transitions", () => {
  const previous = plan({ status: "closed" });
  const current = plan({ id: "v2", basePlanId: previous.id, versionNo: 2 });
  assert.deepEqual(strategyOperations(previous, [previous, current], all).actions, ["view", "validation", "versions"]);
  const closed = plan({ status: "closed" });
  assert.deepEqual(strategyOperations(closed, [closed], all).actions, ["view", "validation", "versions", "archived"]);
  const archived = plan({ status: "archived" });
  assert.deepEqual(strategyOperations(archived, [archived], all).actions, ["view", "validation", "versions"]);
  assert.equal(strategyOperations(archived, [archived], all).primary, undefined);
});

test("ending or replacing a base invalidates its unfinished draft and prevents publication or continued editing", () => {
  const base = plan({ status: "closed" });
  const draft = plan({ id: "draft", status: "draft", basePlanId: base.id, versionNo: null });
  assert.deepEqual(strategyOperations(draft, [base, draft], all).actions, ["view", "versions", "discard"]);
  assert.equal(strategyOperations(draft, [base, draft], all).staleDraft, true);
  const newer = plan({ id: "v2", versionNo: 2 });
  assert.equal(strategyOperations(draft, [base, newer, draft], all).staleDraft, true);
});

test("readers never receive mutations, and a draft in another strategy cannot be resumed", () => {
  const p = plan();
  const unrelated = plan({ id: "other", lineageId: "other", status: "draft", versionNo: null });
  assert.equal(strategyOperations(p, [p, unrelated], all).primary, "revise");
  for (const status of ["approved", "active", "closed", "archived"] as const) {
    const current = plan({ status });
    assert.deepEqual(strategyOperations(current, [current], readOnly).actions, ["view", "validation", "versions"]);
    assert.equal(strategyOperations(current, [current], readOnly).primary, undefined);
  }
});
