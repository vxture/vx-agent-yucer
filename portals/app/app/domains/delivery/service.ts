// D7 application service: gate -> rule -> persistence for delivery and revenue.
//
// The one rule worth restating: a project with an overdue instalment MUST NOT be
// green. Delivery status is self-reported by the people delivering, and "we are
// fine" next to "they have not paid" is the single most common way a failing
// engagement stays green until it is a crisis. projectView() therefore always
// returns the DERIVED health, and says when it downgraded a report and why.

import { planMilestone, type MilestoneDraft } from "./lib/milestone";
import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import {
  deriveProjectHealth,
  milestoneProgress,
  planRevenueTransition,
  summarizeCollections,
  type CollectionSummary,
  type ProjectHealth,
  type RevenueStatus,
  type HealthOverride,
} from "./lib/revenue";
import type { Money } from "../shared/money";
import type {
  DeliveryStore,
  InstalmentRecord,
  MilestoneRecord,
  ProjectFilter,
  ProjectRecord,
} from "./store";

export interface DeliveryContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: DeliveryStore;
}

export async function listProjects(
  ctx: DeliveryContext,
  filter: ProjectFilter = {},
): Promise<RuleResult<ProjectRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "delivery.project.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listProjects(ctx.workspaceId, filter));
}

export interface ProjectView {
  project: ProjectRecord;
  milestones: MilestoneRecord[];
  instalments: InstalmentRecord[];
  progress: ReturnType<typeof milestoneProgress>;
  /** Null when the caller lacks the revenue capability - see below. */
  collections: CollectionSummary | null;
  reportedHealth: ProjectHealth;
  derivedHealth: ProjectHealth;
  healthOverriddenBecause: HealthOverride | null;
}

/**
 * A project with everything derived alongside it.
 *
 * The revenue side is gated SEPARATELY on delivery.revenue: a starter workspace
 * runs projects and milestones without the money view. When that gate fails the
 * project still renders - `collections` is null rather than the whole call being
 * refused, because losing the project view to a missing revenue capability would
 * be a worse answer than the one the tier actually bought.
 *
 * Health is still derived from the instalments even when collections are hidden.
 * The overdue-forbids-green rule is a safety property, not a paid feature.
 */
export async function projectView(
  ctx: DeliveryContext,
  projectId: string,
  opts: { now?: Date } = {},
): Promise<RuleResult<ProjectView>> {
  const gate = can(ctx.holder, ctx.entitlement, "delivery.project.view", "data");
  if (!gate.allowed) return denied(gate);

  const project = await ctx.store.getProject(ctx.workspaceId, projectId);
  if (!project) return fail(violation("not_found", `project ${projectId} was not found`, "projectId"));

  const [milestones, instalments] = await Promise.all([
    ctx.store.listMilestones(ctx.workspaceId, projectId),
    ctx.store.listInstalments(ctx.workspaceId, projectId),
  ]);

  const health = deriveProjectHealth({
    reported: project.health,
    instalments,
    milestones,
    now: opts.now,
  });
  if (!health.ok) return health as RuleResult<ProjectView>;

  const revenueGate = can(ctx.holder, ctx.entitlement, "delivery.revenue.view", "data");
  let collections: CollectionSummary | null = null;
  if (revenueGate.allowed) {
    const summary = summarizeCollections(instalments, project.currency, opts.now);
    if (!summary.ok) return summary as RuleResult<ProjectView>;
    collections = summary.value;
  }

  return ok({
    project,
    milestones,
    instalments: revenueGate.allowed ? instalments : [],
    progress: milestoneProgress(milestones),
    collections,
    reportedHealth: project.health,
    derivedHealth: health.value.health,
    healthOverriddenBecause: health.value.overriddenBecause,
  });
}

/**
 * Move an instalment along its state machine.
 *
 * Gated on delivery.revenue.upsert - the money side, not the project side. A
 * delivery manager who may edit milestones does not automatically get to mark an
 * invoice settled.
 */
/**
 * Create or edit a milestone on a project.
 *
 * `delivery.milestone.upsert` shipped in batch 1 with nothing behind it
 * (TD-016). The port had `listMilestones` and no write, so a delivery plan
 * could only ever be what db-init put there - and `projectView` already
 * returned the milestones while nothing rendered them, the same shape the
 * instalments were in before 6a-3b.
 *
 * IT DECIDES A VERDICT ON THE PAGE. `deriveProjectHealth` reads milestone
 * status: one `missed` milestone overrides a manager's reported green, and the
 * done count is the progress figure. So this is not bookkeeping - it is the
 * input to the only place the product contradicts what a person reported.
 *
 * By (project, sequence), because `sequence` is unique per project and carries
 * no UPDATE grant: it is the anchor, and re-importing a plan updates it rather
 * than producing a second copy of every step.
 */
export async function upsertMilestone(
  ctx: DeliveryContext,
  projectId: string,
  input: MilestoneDraft,
): Promise<RuleResult<MilestoneRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "delivery.milestone.upsert", "data");
  if (!gate.allowed) return denied(gate);

  // The project must exist and belong to this workspace before a milestone can
  // hang off it. The FK would catch a bad id, but as a constraint name - and
  // the milestone table has no workspace predicate of its own in the upsert
  // key, so this read is what keeps the write inside the tenant.
  const project = await ctx.store.getProject(ctx.workspaceId, projectId);
  if (!project) return fail(violation("not_found", `project ${projectId} was not found`, "projectId"));

  const plan = planMilestone(input);
  if (!plan.ok) return plan as RuleResult<MilestoneRecord>;

  return ok(await ctx.store.upsertMilestone(ctx.workspaceId, projectId, plan.value));
}

export async function transitionInstalment(
  ctx: DeliveryContext,
  input: { projectId: string; instalmentId: string; to: RevenueStatus; actualAmount?: Money; at?: Date },
): Promise<RuleResult<{ status: RevenueStatus }>> {
  const gate = can(ctx.holder, ctx.entitlement, "delivery.revenue.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const instalments = await ctx.store.listInstalments(ctx.workspaceId, input.projectId);
  const current = instalments.find((i) => i.id === input.instalmentId);
  if (!current) {
    return fail(violation("not_found", `instalment ${input.instalmentId} was not found`, "instalmentId"));
  }

  const plan = planRevenueTransition(current, input.to, {
    actualAmount: input.actualAmount,
    at: input.at,
  });
  if (!plan.ok) return plan as RuleResult<{ status: RevenueStatus }>;

  const applied = await ctx.store.updateInstalment(ctx.workspaceId, input.instalmentId, plan.value);
  if (!applied) {
    return fail(violation("not_found", `instalment ${input.instalmentId} was not found`, "instalmentId"));
  }
  return ok({ status: plan.value.status });
}

/**
 * Reconcile the stored project health with what the instalments and milestones
 * actually say, and write the result when it differs.
 *
 * Only ever downgrades - deriveProjectHealth enforces that. A delivery team's
 * amber survives a clean schedule, because they know things this does not.
 */
export async function reconcileProjectHealth(
  ctx: DeliveryContext,
  projectId: string,
  opts: { now?: Date } = {},
): Promise<RuleResult<{ health: ProjectHealth; changed: boolean; because: HealthOverride | null }>> {
  const gate = can(ctx.holder, ctx.entitlement, "delivery.project.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const project = await ctx.store.getProject(ctx.workspaceId, projectId);
  if (!project) return fail(violation("not_found", `project ${projectId} was not found`, "projectId"));

  const [milestones, instalments] = await Promise.all([
    ctx.store.listMilestones(ctx.workspaceId, projectId),
    ctx.store.listInstalments(ctx.workspaceId, projectId),
  ]);

  const derived = deriveProjectHealth({
    reported: project.health,
    instalments,
    milestones,
    now: opts.now,
  });
  if (!derived.ok) {
    return derived as RuleResult<{ health: ProjectHealth; changed: boolean; because: HealthOverride | null }>;
  }

  const changed = derived.value.health !== project.health;
  if (changed) {
    await ctx.store.updateProject(ctx.workspaceId, projectId, { health: derived.value.health });
  }
  return ok({ health: derived.value.health, changed, because: derived.value.overriddenBecause });
}
