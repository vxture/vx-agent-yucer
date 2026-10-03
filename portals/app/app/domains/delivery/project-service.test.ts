import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { money } from "../shared/money";
import { InMemoryDeliveryStore, type ProjectRecord } from "./store";
import { cancelProject, createInstalment, createProject, editProject, removeInstalment, removeMilestone, type DeliveryContext } from "./service";
import type { NewProjectDraft } from "./lib/project";

// Creating, editing and calling off a project. None of the three existed in the
// product: the roster read rows that only seeds and tests ever wrote.

const WS = "ws_1";

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryDeliveryStore()): DeliveryContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

const NEW: NewProjectDraft = {
  projectNo: "PRJ-9",
  name: "POS rollout",
  accountId: "acc_1",
  opportunityId: null,
  managerSub: "usr_pm",
  contractAmount: 500_000,
  currency: "CNY",
  endsAt: new Date("2027-03-31T00:00:00Z"),
  engagementType: "one_off",
};
const FOUND = { accountFound: true } as const;

function project(over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "prj_a", workspaceId: WS, projectNo: "PRJ-1", name: "Existing", opportunityId: null, accountId: "acc_1",
    managerSub: null, contractAmount: money(100_000, "CNY"), health: "green", status: "active", currency: "CNY",
    endsAt: null, engagementType: "one_off", contractId: null, ...over,
  };
}

const code = (r: { ok: boolean; violations?: { code: string }[] }) => (r.ok ? null : r.violations![0]!.code);

test("a project is created in planning, reported healthy, under a number nobody holds", async () => {
  const store = new InMemoryDeliveryStore();
  const c = ctx("delivery_manager", "business", store);
  const made = unwrap(await createProject(c, NEW, FOUND));
  assert.equal(made.status, "planning", "the status is not an argument");
  assert.equal(made.health, "green");
  assert.equal(made.contractAmount?.amount, 500_000);

  assert.equal(code(await createProject(c, NEW, FOUND)), "project_no_taken");
  assert.equal(code(await createProject(c, { ...NEW, projectNo: "PRJ-10", name: " " }, FOUND)), "name_required");
  assert.equal(code(await createProject(c, { ...NEW, projectNo: "PRJ-10", contractAmount: -1 }, FOUND)), "amount_negative");
  assert.equal(code(await createProject(c, { ...NEW, projectNo: "PRJ-10" }, { accountFound: false })), "account_not_found");
});

test("a deal may be named only if it is found and belongs to the same customer", async () => {
  const c = ctx("delivery_manager", "business");
  const withDeal = { ...NEW, projectNo: "PRJ-11", opportunityId: "opp_1" };
  assert.equal(code(await createProject(c, withDeal, { accountFound: true, opportunityAccountId: null })), "opportunity_not_found");
  assert.equal(code(await createProject(c, withDeal, { accountFound: true, opportunityAccountId: "acc_other" })), "opportunity_other_account");
  assert.equal(unwrap(await createProject(c, withDeal, { accountFound: true, opportunityAccountId: "acc_1" })).opportunityId, "opp_1");
});

test("a project is edited while it lives, never once delivered, closed or cancelled", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project({ id: "prj_a" }), project({ id: "prj_b", projectNo: "PRJ-2", status: "delivered" })] });
  const c = ctx("delivery_manager", "business", store);
  const { projectNo: _n, accountId: _a, opportunityId: _o, ...fields } = NEW;
  unwrap(await editProject(c, "prj_a", { ...fields, name: "Renamed", contractAmount: 750_000 }));
  const after = (await store.getProject(WS, "prj_a"))!;
  assert.equal(after.name, "Renamed");
  assert.equal(after.contractAmount?.amount, 750_000);
  assert.equal(after.projectNo, "PRJ-1", "the number never moves");
  assert.equal(code(await editProject(c, "prj_b", { ...fields })), "project_settled");
  assert.equal(code(await editProject(c, "prj_zz", { ...fields })), "not_found");
  assert.equal(code(await editProject(ctx("viewer", "business", store), "prj_a", { ...fields })), "permission_denied");
});

test("a project is cancelled from planning, active or on hold - not when money has moved on it", async () => {
  const store = new InMemoryDeliveryStore();
  const inst = (status: "planned" | "invoiced" | "settled") => ({
    id: `i_${status}`, workspaceId: WS, projectId: "prj_paid", milestoneId: "m1", sequence: 1, status,
    plannedAmount: money(10, "CNY"), actualAmount: null, dueAt: null, settledAt: null,
  });
  store.seed({
    projects: [
      project({ id: "prj_a" }),
      project({ id: "prj_done", projectNo: "PRJ-3", status: "closed" }),
      project({ id: "prj_paid", projectNo: "PRJ-4" }),
      project({ id: "prj_plan", projectNo: "PRJ-5", status: "planning" }),
    ],
    instalments: [inst("invoiced")],
  });
  const c = ctx("delivery_manager", "business", store);
  unwrap(await cancelProject(c, "prj_a"));
  assert.equal((await store.getProject(WS, "prj_a"))?.status, "cancelled");
  unwrap(await cancelProject(c, "prj_plan"));
  assert.equal(code(await cancelProject(c, "prj_done")), "illegal_transition");
  assert.equal(code(await cancelProject(c, "prj_paid")), "project_has_receipts");
  assert.equal((await store.getProject(WS, "prj_paid"))?.status, "active", "a refused cancel changes nothing");
  assert.equal(code(await cancelProject(c, "prj_zz")), "not_found");
});

// --- Taking a milestone off a plan ---------------------------------------------

test("a gate nobody relies on can be removed; a completed, moved or relied-on one cannot", async () => {
  const store = new InMemoryDeliveryStore();
  const gate = (id: string, sequence: number, status: "pending" | "done" = "pending") => ({
    id, projectId: "prj_a", workspaceId: WS, name: id, sequence, status, dueAt: null,
    completedAt: status === "done" ? new Date("2026-01-01T00:00:00Z") : null, baselineDueAt: null, acceptance: null,
  });
  store.seed({
    projects: [project({ id: "prj_a" })],
    milestones: [gate("m_free", 1), gate("m_done", 2, "done"), gate("m_moved", 3), gate("m_rel", 4)],
    instalments: [
      { id: "i1", workspaceId: WS, projectId: "prj_a", milestoneId: "m_rel", sequence: 1, status: "planned",
        plannedAmount: money(10, "CNY"), actualAmount: null, dueAt: null, settledAt: null },
    ],
  });
  await store.appendMilestoneChanges(WS, "m_moved", [
    { field: "due_at", fromValue: "2026-01-01", toValue: "2026-02-01", reason: "customer asked", changedBySub: "usr_me" },
  ]);
  const c = ctx("delivery_manager", "business", store);

  unwrap(await removeMilestone(c, "prj_a", 1));
  assert.equal((await store.listMilestones(WS, "prj_a")).some((m) => m.id === "m_free"), false);
  assert.equal(code(await removeMilestone(c, "prj_a", 2)), "milestone_not_pending");
  assert.equal(code(await removeMilestone(c, "prj_a", 3)), "milestone_moved");
  assert.equal(code(await removeMilestone(c, "prj_a", 4)), "milestone_has_instalments");
  assert.equal(code(await removeMilestone(c, "prj_a", 9)), "not_found");
  assert.equal(code(await removeMilestone(c, "prj_zz", 1)), "not_found");
  assert.equal(code(await removeMilestone(ctx("viewer", "business", store), "prj_a", 4)), "permission_denied");
  assert.equal((await store.listMilestones(WS, "prj_a")).length, 3, "every refusal left the plan whole");
});

// --- The collection plan: adding an instalment, and taking a mistaken one off ----

test("an instalment is added as a plan, on the next sequence, released by a gate of the same project", async () => {
  const store = new InMemoryDeliveryStore();
  const gate = (id: string, projectId: string) => ({
    id, projectId, workspaceId: WS, name: id, sequence: 1, status: "pending" as const, dueAt: null,
    completedAt: null, baselineDueAt: null, acceptance: null,
  });
  store.seed({
    projects: [project({ id: "prj_a" }), project({ id: "prj_b", projectNo: "PRJ-2" }), project({ id: "prj_x", projectNo: "PRJ-3", status: "closed" })],
    milestones: [gate("m_a", "prj_a"), gate("m_b", "prj_b"), gate("m_x", "prj_x")],
  });
  const c = ctx("delivery_manager", "business", store);
  const draft = { projectId: "prj_a", milestoneId: "m_a", plannedAmount: 50_000, currency: "CNY", dueAt: new Date("2026-12-01T00:00:00Z") };

  const first = unwrap(await createInstalment(c, draft));
  assert.equal(first.status, "planned", "the status is not an argument");
  assert.equal(first.sequence, 1);
  assert.equal(unwrap(await createInstalment(c, draft)).sequence, 2, "the next sequence, not a reused one");

  assert.equal(code(await createInstalment(c, { ...draft, plannedAmount: 0 })), "instalment_amount_invalid");
  assert.equal(code(await createInstalment(c, { ...draft, currency: " " })), "instalment_currency_required");
  assert.equal(code(await createInstalment(c, { ...draft, milestoneId: "m_zz" })), "instalment_gate_not_found");
  // Another project's gate is simply not on THIS project's plan.
  assert.equal(code(await createInstalment(c, { ...draft, milestoneId: "m_b" })), "instalment_gate_not_found");
  assert.equal(code(await createInstalment(c, { ...draft, projectId: "prj_x", milestoneId: "m_x" })), "project_closed");
  assert.equal(code(await createInstalment(c, { ...draft, projectId: "prj_zz" })), "not_found");
  assert.equal(code(await createInstalment(ctx("viewer", "business", store), draft)), "permission_denied");
});

test("only an instalment that is still a plan can be taken off it", async () => {
  const store = new InMemoryDeliveryStore();
  const inst = (id: string, sequence: number, status: "planned" | "invoiced") => ({
    id, workspaceId: WS, projectId: "prj_a", milestoneId: "m1", sequence, status,
    plannedAmount: money(10, "CNY"), actualAmount: null, dueAt: null, settledAt: null,
  });
  store.seed({ projects: [project({ id: "prj_a" })], instalments: [inst("i_plan", 1, "planned"), inst("i_inv", 2, "invoiced")] });
  const c = ctx("delivery_manager", "business", store);
  unwrap(await removeInstalment(c, "prj_a", "i_plan"));
  assert.equal((await store.listInstalments(WS, "prj_a")).some((i) => i.id === "i_plan"), false);
  assert.equal(code(await removeInstalment(c, "prj_a", "i_inv")), "instalment_not_planned");
  assert.equal(code(await removeInstalment(c, "prj_a", "i_zz")), "not_found");
  assert.equal((await store.listInstalments(WS, "prj_a")).length, 1, "the invoiced one stays");
});
