import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryDeliveryStore, type InstalmentRecord, type MilestoneRecord, type ProjectRecord } from "./store";
import {
  listProjects,
  listRenewals,
  renewalDraft,
  projectView,
  reconcileProjectHealth,
  transitionInstalment,
  upsertMilestone,
  type DeliveryContext,
} from "./service";

const WS = "ws_1";
const NOW = new Date("2026-08-15T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function project(over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "prj_1",
    workspaceId: WS,
    projectNo: "PRJ-1",
    name: "Rollout",
    opportunityId: "opp_1",
    accountId: "acc_1",
    managerSub: "usr_pm",
    contractAmount: money(1_000_000),
    health: "green",
    status: "active",
    currency: "CNY",
    endsAt: null,
    engagementType: "one_off",
    ...over,
  };
}

function instalment(over: Partial<InstalmentRecord> = {}): InstalmentRecord & { workspaceId: string } {
  return {
    id: "inst_1",
    projectId: "prj_1",
    milestoneId: null,
    sequence: 1,
    status: "planned",
    plannedAmount: money(500_000),
    actualAmount: null,
    dueAt: daysAhead(30),
    settledAt: null,
    workspaceId: WS,
    ...over,
  };
}

function milestone(over: Partial<MilestoneRecord> = {}): MilestoneRecord & { workspaceId: string } {
  return {
    id: "ms_1",
    projectId: "prj_1",
    name: "Phase 1",
    sequence: 1,
    status: "done",
    dueAt: daysAgo(10),
    completedAt: daysAgo(11),
    workspaceId: WS,
    ...over,
  };
}

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryDeliveryStore()): DeliveryContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

// --- The overdue-forbids-green rule ----------------------------------------

test("an overdue instalment downgrades a reported green, and says why", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [project({ health: "green" })],
    instalments: [instalment({ status: "overdue", dueAt: daysAgo(10) })],
  });
  const view = unwrap(await projectView(ctx("delivery_manager", "business", store), "prj_1", { now: NOW }));

  assert.equal(view.reportedHealth, "green");
  assert.equal(view.derivedHealth, "amber");
  assert.deepEqual(view.healthOverriddenBecause, { code: "overdue_instalment", count: 1 });
});

test("the overdue rule applies even when the revenue view is not bought", async () => {
  // It is a safety property, not a paid feature. delivery.revenue starts at
  // business; a starter workspace still must not see a false green.
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [project({ health: "green" })],
    instalments: [instalment({ status: "overdue", dueAt: daysAgo(5) })],
  });
  const view = unwrap(await projectView(ctx("delivery_manager", "starter", store), "prj_1", { now: NOW }));

  assert.equal(view.collections, null, "the money view is withheld");
  assert.equal(view.derivedHealth, "amber", "but the health rule still bit");
});

test("losing the revenue capability does not lose the project view", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project()], milestones: [milestone()] });
  const view = unwrap(await projectView(ctx("delivery_manager", "starter", store), "prj_1", { now: NOW }));

  assert.equal(view.project.id, "prj_1");
  assert.equal(view.progress.done, 1);
  assert.deepEqual(view.instalments, [], "instalments withheld with the revenue gate");
  assert.equal(view.collections, null);
});

test("a business workspace gets the collections summary", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [project()],
    instalments: [
      instalment({ id: "a", sequence: 1, status: "settled", actualAmount: money(400_000) }),
      instalment({ id: "b", sequence: 2, plannedAmount: money(500_000) }),
    ],
  });
  const view = unwrap(await projectView(ctx("delivery_manager", "business", store), "prj_1", { now: NOW }));
  assert.equal(view.collections?.collected.amount, 400_000);
  assert.equal(view.collections?.planned.amount, 1_000_000);
});

test("derived health only downgrades - a reported amber survives a clean schedule", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [project({ health: "amber" })],
    instalments: [instalment({ status: "settled", actualAmount: money(500_000) })],
  });
  const view = unwrap(await projectView(ctx("delivery_manager", "business", store), "prj_1", { now: NOW }));
  assert.equal(view.derivedHealth, "amber");
  assert.equal(view.healthOverriddenBecause, null);
});

// --- Reconcile --------------------------------------------------------------

test("reconcile writes the downgrade back and reports the change", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [project({ health: "green" })],
    instalments: [instalment({ status: "overdue", dueAt: daysAgo(3) })],
  });
  const out = unwrap(await reconcileProjectHealth(ctx("delivery_manager", "business", store), "prj_1", { now: NOW }));

  assert.equal(out.changed, true);
  assert.equal(out.health, "amber");
  assert.equal((await store.getProject(WS, "prj_1"))?.health, "amber");
});

test("reconcile is a no-op when nothing needs downgrading", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project({ health: "green" })], instalments: [] });
  const out = unwrap(await reconcileProjectHealth(ctx("delivery_manager", "business", store), "prj_1", { now: NOW }));
  assert.equal(out.changed, false);
});

// --- Instalment transitions -------------------------------------------------

test("settling requires the money permission, not merely the project one", async () => {
  // A delivery manager who may edit milestones does not automatically get to
  // mark an invoice settled... except delivery_manager does hold delivery.write.
  // presales holds delivery.read only, and is the honest negative case.
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project()], instalments: [instalment({ status: "invoiced" })] });
  const r = await transitionInstalment(ctx("presales", "business", store), {
    projectId: "prj_1",
    instalmentId: "inst_1",
    to: "settled",
    actualAmount: money(500_000),
  });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("the revenue capability is business-tier", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project()], instalments: [instalment({ status: "invoiced" })] });
  const r = await transitionInstalment(ctx("delivery_manager", "pro", store), {
    projectId: "prj_1",
    instalmentId: "inst_1",
    to: "settled",
    actualAmount: money(500_000),
  });
  assert.equal(r.ok === false && r.violations[0].code, "feature_not_in_tier");
});

test("settling records what actually arrived", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project()], instalments: [instalment({ status: "invoiced" })] });
  const out = unwrap(
    await transitionInstalment(ctx("delivery_manager", "business", store), {
      projectId: "prj_1",
      instalmentId: "inst_1",
      to: "settled",
      actualAmount: money(450_000),
      at: NOW,
    }),
  );
  assert.equal(out.status, "settled");
  const rows = await store.listInstalments(WS, "prj_1");
  assert.equal(rows[0].actualAmount?.amount, 450_000, "planned vs actual is the number this table exists for");
});

test("settling without an amount is refused", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project()], instalments: [instalment({ status: "invoiced" })] });
  const r = await transitionInstalment(ctx("delivery_manager", "business", store), {
    projectId: "prj_1",
    instalmentId: "inst_1",
    to: "settled",
  });
  assert.equal(r.ok === false && r.violations[0].code, "actual_amount_required");
});

test("an illegal transition is refused after the gate passes", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [project()],
    instalments: [instalment({ status: "settled", actualAmount: money(500_000) })],
  });
  const r = await transitionInstalment(ctx("delivery_manager", "business", store), {
    projectId: "prj_1",
    instalmentId: "inst_1",
    to: "planned",
  });
  assert.equal(r.ok === false && r.violations[0].code, "illegal_transition");
});

// --- Isolation --------------------------------------------------------------

test("a project in another workspace is not found", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project({ workspaceId: "ws_other" })] });
  const r = await projectView(ctx("delivery_manager", "business", store), "prj_1", { now: NOW });
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

test("listing is gated and workspace-scoped", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project({ id: "mine" }), project({ id: "theirs", workspaceId: "ws_other" })] });
  const rows = unwrap(await listProjects(ctx("delivery_manager", "starter", store)));
  assert.deepEqual(rows.map((r) => r.id), ["mine"]);
  assert.equal((await listProjects(ctx("delivery_manager", "free", store))).ok, false);
});

// --- Milestones, which nothing could write until now (TD-016) ---------------

const msDraft = {
  sequence: 1,
  name: "Kickoff",
  dueAt: new Date("2026-09-01T00:00:00Z"),
  completedAt: null as Date | null,
  status: "pending" as const,
};

test("a viewer may read a project and may not edit its plan", async () => {
  // viewer holds delivery.read and not delivery.write, the pair that pins this
  // to the WRITE action rather than to any delivery access.
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project()] });
  const r = await upsertMilestone(ctx("viewer", "starter", store), "prj_1", msDraft);
  assert.equal(r.ok === false && r.violations[0]!.code, "permission_denied");
});

test("a milestone cannot be hung off a project in another workspace", async () => {
  // The upsert key is (project, sequence) and carries no workspace of its own,
  // so this read is what keeps the write inside the tenant. Without it the
  // sequence collision alone would decide which row got edited.
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project({ workspaceId: "ws_other" })] });
  const r = await upsertMilestone(ctx("delivery_manager", "starter", store), "prj_1", msDraft);
  assert.equal(r.ok === false && r.violations[0]!.code, "not_found");
});

test("the same sequence EDITS that step rather than adding a second one", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project()] });
  const c = ctx("delivery_manager", "starter", store);
  const first = unwrap(await upsertMilestone(c, "prj_1", msDraft));
  const again = unwrap(await upsertMilestone(c, "prj_1", { ...msDraft, name: "Kickoff (moved)" }));

  assert.equal(again.id, first.id, "sequence is the identity");
  assert.equal(again.name, "Kickoff (moved)");
  assert.equal((await store.listMilestones(WS, "prj_1")).length, 1);
});

test("a missed milestone overrides the manager's reported green", async () => {
  // The reason this panel is not bookkeeping. deriveProjectHealth reads
  // milestone status, and this is the only place in the product that
  // contradicts what a person reported.
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project({ health: "green" })] });
  const c = ctx("delivery_manager", "starter", store);

  const before = unwrap(await projectView(c, "prj_1"));
  assert.equal(before.derivedHealth, "green");

  unwrap(await upsertMilestone(c, "prj_1", { ...msDraft, status: "missed" }));

  const after = unwrap(await projectView(c, "prj_1"));
  assert.notEqual(after.derivedHealth, "green", "the plan changed the verdict");
  assert.deepEqual(after.healthOverriddenBecause, { code: "missed_milestone", count: 1 });
});

// --- Renewal: the D7 -> D6 return leg ---------------------------------------

const subscription = (over: Partial<ProjectRecord> = {}) =>
  project({ engagementType: "subscription", endsAt: daysAhead(30), ...over });

const renewalCtx = (store: InMemoryDeliveryStore) =>
  ctx("delivery_manager", "business", store);

test("a one-off project never appears as due, however close its end date", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [project({ engagementType: "one_off", endsAt: daysAhead(1) })] });
  const rows = unwrap(await listRenewals(renewalCtx(store), new Set(), { now: NOW }));
  // Filtered by the store before the rule ever sees it - the query asks for
  // subscriptions, so a one-off is not in the list at all.
  assert.deepEqual(rows, []);
});

test("a lapsed term is the most urgent row, not a filtered-out one", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [
      subscription({ id: "prj_soon", endsAt: daysAhead(10), name: "Soon" }),
      subscription({ id: "prj_lapsed", endsAt: daysAgo(12), name: "Lapsed" }),
    ],
  });
  const rows = unwrap(await listRenewals(renewalCtx(store), new Set(), { now: NOW }));
  assert.equal(rows[0].project.id, "prj_lapsed");
  assert.equal(rows[0].verdict.kind, "due");
  // Negative, which is what makes the sort put it first and what lets the page
  // say "lapsed 12 days ago" instead of "-12 days left".
  assert.equal(rows[0].verdict.kind === "due" && rows[0].verdict.daysToEnd, -12);
});

test("a project with a renewal already open is not proposed a second time", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [subscription()] });

  const fresh = unwrap(await listRenewals(renewalCtx(store), new Set(), { now: NOW }));
  assert.equal(fresh[0].verdict.kind, "due");

  const renewed = unwrap(
    await listRenewals(renewalCtx(store), new Set(["prj_1"]), { now: NOW }),
  );
  assert.equal(renewed[0].verdict.kind, "not_due");
  assert.equal(
    renewed[0].verdict.kind === "not_due" && renewed[0].verdict.reason,
    "already_renewed",
  );
  // And no draft, so nothing downstream can open the second deal anyway.
  assert.equal(renewed[0].draft, null);
});

test("risk reads the DERIVED health, not the one the delivery team reported", async () => {
  // The whole point of deriving health for the survivors. A green report next
  // to an overdue instalment is exactly the renewal somebody would walk into
  // assuming it was safe.
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [subscription({ health: "green" })],
    instalments: [instalment({ status: "overdue", dueAt: daysAgo(10) })],
  });
  const rows = unwrap(await listRenewals(renewalCtx(store), new Set(), { now: NOW }));
  assert.equal(rows[0].verdict.kind === "due" && rows[0].verdict.risk, "watch");
});

test("a clean subscription reads low risk", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({
    projects: [subscription({ health: "green" })],
    instalments: [instalment({ status: "settled", settledAt: daysAgo(2) })],
    milestones: [milestone({ status: "done" })],
  });
  const rows = unwrap(await listRenewals(renewalCtx(store), new Set(), { now: NOW }));
  assert.equal(rows[0].verdict.kind === "due" && rows[0].verdict.risk, "low");
});

test("a subscription with no end date stays in the list, with the gap named", async () => {
  // It is not due, but dropping it would hide a data gap that silently costs a
  // renewal - the same argument that keeps unroutable leads on /routing.
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [subscription({ endsAt: null })] });
  const rows = unwrap(await listRenewals(renewalCtx(store), new Set(), { now: NOW }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verdict.kind === "not_due" && rows[0].verdict.reason, "no_end_date");
});

test("a paused project is still running its clock", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [subscription({ status: "on_hold" })] });
  const rows = unwrap(await listRenewals(renewalCtx(store), new Set(), { now: NOW }));
  assert.equal(rows[0].verdict.kind, "due");
});

test("the draft carries last term's amount, not an invented uplift", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [subscription({ contractAmount: money(1_000_000) })] });
  const draft = unwrap(await renewalDraft(renewalCtx(store), "prj_1", { now: NOW }));
  assert.equal(draft.amount, 1_000_000);
  assert.equal(draft.sourceProjectId, "prj_1");
  assert.equal(draft.accountId, "acc_1");
});

test("re-deriving refuses a project the page thought was due", async () => {
  // The stale-page case: the button was there when it was clicked, and the
  // renewal was opened by somebody else in between.
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [subscription()] });
  const result = await renewalDraft(renewalCtx(store), "prj_1", {
    now: NOW,
    alreadyRenewed: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.violations[0].code, "renewal_not_due");
});

test("a project outside this workspace is not found rather than derived", async () => {
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [subscription({ workspaceId: "ws_other" })] });
  const result = await renewalDraft(renewalCtx(store), "prj_1", { now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.violations[0].code, "not_found");
});

test("both renewal verbs are refused when the tier does not include delivery", async () => {
  // The entitlement half of the gate. Both verbs read projects, so a tier
  // without the delivery capability must not get a renewal list either - a
  // derived view is not a way around the gate on what it derives from.
  const store = new InMemoryDeliveryStore();
  store.seed({ projects: [subscription()] });
  const blind = ctx("delivery_manager", "free", store);
  const list = await listRenewals(blind, new Set(), { now: NOW });
  const one = await renewalDraft(blind, "prj_1", { now: NOW });
  assert.equal(list.ok, false);
  assert.equal(one.ok, false);
});
