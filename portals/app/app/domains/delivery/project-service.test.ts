import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { money } from "../shared/money";
import { InMemoryDeliveryStore, type ProjectRecord } from "./store";
import { cancelProject, createProject, editProject, type DeliveryContext } from "./service";
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
