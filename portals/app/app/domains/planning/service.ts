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
import {
  measure,
  planTargetCreation,
  planTargetUpdate,
  targetValue,
  type Measurement,
  type SalesTarget,
  type TargetScope,
  type TargetStatus,
} from "./lib/target";
import { planTerritory, type TerritoryDraft } from "./lib/territory";
import { DEFAULT_CURRENCY } from "../shared/money";
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
  opts: { includeRetired?: boolean } = {},
): Promise<RuleResult<TerritoryRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.territory.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listTerritories(ctx.workspaceId, opts));
}

/**
 * Create or update a territory.
 *
 * THE VERB THAT WAS NEVER WRITTEN. `planning.territory.upsert` has been in the
 * action catalogue since batch 1, carrying the frozen feature key
 * `planning.territory` and sold from PRO up - and nothing implemented it. A
 * paying workspace could read territories it had no way to create, and because
 * a territory-scoped target needs a territory_id, it could not set a regional
 * target either. The database, the grants, the column locks and the gate were
 * all in place; only the middle was missing.
 *
 * UPSERT BY CODE. `territory_code` is the anchor - immutable in the DDL, absent
 * from the writable columns - so the code identifies the row and everything
 * else may move. Re-importing a regional structure updates it rather than
 * duplicating it.
 *
 * The existing list is read first so the rule can refuse a parent that does not
 * exist or one that would close a cycle. A cycle is legal to the FK and
 * nonsense to every reader of the hierarchy.
 */
export async function upsertTerritory(
  ctx: PlanningContext,
  input: TerritoryDraft,
): Promise<RuleResult<TerritoryRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.territory.upsert", "data");
  if (!gate.allowed) return denied(gate);

  // Retired ones included: they still occupy their code, and a parent that has
  // been wound down is still a real ancestor for cycle purposes.
  const existing = await ctx.store.listTerritories(ctx.workspaceId, { includeRetired: true });
  const plan = planTerritory(input, existing);
  if (!plan.ok) return plan as RuleResult<TerritoryRecord>;

  return ok(await ctx.store.upsertTerritory(ctx.workspaceId, plan.value));
}

/**
 * The caller sends a NUMBER and a currency, never a typed value.
 *
 * The unit is a pure function of the metric (`unitOf`), so deriving it here
 * makes "a count target that carries a currency" unrepresentable rather than
 * merely discouraged. TD-013 existed because the caller chose the shape, and
 * the only shape on offer was money.
 */
export async function createTarget(
  ctx: PlanningContext,
  input: { scope: TargetScope; amount: number; currency?: string; planId?: string | null },
): Promise<RuleResult<TargetRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.target.create", "data");
  if (!gate.allowed) return denied(gate);

  // The duplicate check is done against the scope tuple, so the caller gets
  // "a target already exists for this scope" instead of a unique-index error.
  const existing = await ctx.store.listTargets(ctx.workspaceId, { period: input.scope.period });
  const plan = planTargetCreation({
    scope: input.scope,
    targetValue: targetValue(input.scope.metric, input.amount, input.currency ?? DEFAULT_CURRENCY),
    planId: input.planId,
    existing,
  });
  if (!plan.ok) return plan as RuleResult<TargetRecord>;

  return ok(await ctx.store.createTarget(ctx.workspaceId, plan.value as SalesTarget));
}

export async function updateTarget(
  ctx: PlanningContext,
  id: string,
  patch: { amount?: number; status?: TargetStatus; planId?: string | null },
): Promise<RuleResult<{ id: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.target.update", "data");
  if (!gate.allowed) return denied(gate);

  const current = await ctx.store.getTarget(ctx.workspaceId, id);
  if (!current) return fail(violation("not_found", `target ${id} was not found`, "id"));

  // The unit and the currency come from the target being edited, never from the
  // caller: changing either is what `planTargetUpdate` refuses outright.
  const plan = planTargetUpdate(current, {
    ...(patch.amount === undefined
      ? {}
      : {
          targetValue:
            current.targetValue.unit === "count"
              ? ({ unit: "count", amount: patch.amount } as const)
              : ({ unit: "money", amount: patch.amount, currency: current.targetValue.currency } as const),
        }),
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.planId === undefined ? {} : { planId: patch.planId }),
  });
  if (!plan.ok) return plan as RuleResult<{ id: string }>;

  const applied = await ctx.store.updateTarget(ctx.workspaceId, id, plan.value);
  if (!applied) return fail(violation("not_found", `target ${id} was not found`, "id"));
  return ok({ id });
}

export interface AttainmentRow {
  target: TargetRecord;
  /**
   * What the target has achieved, or why it could not be measured.
   *
   * WAS `{closed, ratio, hasSnapshot}` - three fields the caller had to combine
   * correctly, and which could not express "this metric has no numerator at
   * all". A discriminated union means a page cannot render a percentage for a
   * target that was never measured, because there is no number to render.
   */
  measurement: Measurement;
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
    const totals = await ctx.store.publishedTotalsFor(ctx.workspaceId, target);
    rows.push({ target, measurement: measure(target, totals) });
  }
  return ok(rows);
}
