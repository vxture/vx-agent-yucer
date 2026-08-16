// D2 application service: gate -> rule -> persistence for targets and territories.
//
// The domain split this file protects: D2 SETS targets, D6 COMPUTES achievement,
// and neither writes the other's data. attainment() therefore reads D6's
// forecast snapshots through the store and divides - it never recomputes a
// closed amount from opportunities, because that number already has an owner and
// two implementations of it would eventually disagree in a review.

import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import { attainment as computeAttainment } from "../pipeline/lib/forecast";
import { planTargetCreation, planTargetUpdate, type SalesTarget, type TargetScope, type TargetStatus } from "./lib/target";
import type { Money } from "../shared/money";
import type { PlanningStore, TargetFilter, TargetRecord, TerritoryRecord } from "./store";

export interface PlanningContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: PlanningStore;
}

export async function listTargets(
  ctx: PlanningContext,
  filter: TargetFilter = {},
): Promise<RuleResult<TargetRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.target.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listTargets(ctx.workspaceId, filter));
}

export async function listTerritories(
  ctx: PlanningContext,
): Promise<RuleResult<TerritoryRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.territory.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listTerritories(ctx.workspaceId));
}

export async function createTarget(
  ctx: PlanningContext,
  input: { scope: TargetScope; targetAmount: Money; planId?: string | null },
): Promise<RuleResult<TargetRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.target.create", "data");
  if (!gate.allowed) return denied(gate);

  // The duplicate check is done against the scope tuple, so the caller gets
  // "a target already exists for this scope" instead of a unique-index error.
  const existing = await ctx.store.listTargets(ctx.workspaceId, { period: input.scope.period });
  const plan = planTargetCreation({ ...input, existing });
  if (!plan.ok) return plan as RuleResult<TargetRecord>;

  return ok(await ctx.store.createTarget(ctx.workspaceId, plan.value as SalesTarget));
}

export async function updateTarget(
  ctx: PlanningContext,
  id: string,
  patch: { targetAmount?: Money; status?: TargetStatus; planId?: string | null },
): Promise<RuleResult<{ id: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.target.update", "data");
  if (!gate.allowed) return denied(gate);

  const current = await ctx.store.getTarget(ctx.workspaceId, id);
  if (!current) return fail(violation("not_found", `target ${id} was not found`, "id"));

  const plan = planTargetUpdate(current, patch);
  if (!plan.ok) return plan as RuleResult<{ id: string }>;

  const applied = await ctx.store.updateTarget(ctx.workspaceId, id, plan.value);
  if (!applied) return fail(violation("not_found", `target ${id} was not found`, "id"));
  return ok({ id });
}

export interface AttainmentRow {
  target: TargetRecord;
  closed: Money | null;
  /** Achieved over target. Null when no target was set OR nothing has closed. */
  ratio: number | null;
  /** Distinguishes "no snapshot yet" from "0% attained" for the caller. */
  hasSnapshot: boolean;
}

/**
 * Attainment for a period: each target against what actually closed.
 *
 * The two null cases are kept apart on purpose. `hasSnapshot: false` means D6
 * has not produced a snapshot for that scope yet - nobody has forecast it. A
 * `ratio: null` with a snapshot present means the target was zero. Rendering
 * both as "0%" would report an unforecast quarter as a failed one.
 */
export async function attainment(
  ctx: PlanningContext,
  period: string,
): Promise<RuleResult<AttainmentRow[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.attainment.view", "data");
  if (!gate.allowed) return denied(gate);

  const targets = await ctx.store.listTargets(ctx.workspaceId, { period });
  const rows: AttainmentRow[] = [];

  for (const target of targets) {
    const closed = await ctx.store.closedAmountFor(ctx.workspaceId, target);
    if (!closed) {
      rows.push({ target, closed: null, ratio: null, hasSnapshot: false });
      continue;
    }
    const ratio = computeAttainment(closed, target.targetAmount);
    if (!ratio.ok) return ratio as RuleResult<AttainmentRow[]>;
    rows.push({ target, closed, ratio: ratio.value, hasSnapshot: true });
  }
  return ok(rows);
}
