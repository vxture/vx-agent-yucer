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
import { ORG_KIND_CODE_SHAPE, planOrgUnit, type OrgTemplate, type OrgUnitDraft } from "./lib/org";
import { planMove, type MoveDirection } from "../shared/ordering";
import type { CatalogStore } from "../catalog/store";
import type { OrgKindRecord, OrgUnitRecord, PlanningStore, TargetFilter, TargetRecord, TerritoryRecord } from "./store";

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
  /**
   * The 大区 ids this workspace has (0052), read by the caller from the
   * account domain - this service may not. Given, an id outside it is refused
   * in the product's words; absent, the foreign key is the last word.
   */
  knownDivisionIds?: ReadonlySet<string>,
): Promise<RuleResult<TerritoryRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.territory.upsert", "data");
  if (!gate.allowed) return denied(gate);

  // Retired ones included: they still occupy their code, and a parent that has
  // been wound down is still a real ancestor for cycle purposes.
  const existing = await ctx.store.listTerritories(ctx.workspaceId, { includeRetired: true });
  const plan = planTerritory(input, existing);
  if (!plan.ok) return plan as RuleResult<TerritoryRecord>;

  // THE TWO LINKS (0052) name rows that exist. The units are this domain's;
  // the 大区 are the account domain's, so the caller says which ones there are.
  if (plan.value.unitIds && plan.value.unitIds.length > 0) {
    const units = new Set((await ctx.store.listOrgUnits(ctx.workspaceId)).map((u) => u.id));
    const bad = plan.value.unitIds.find((u) => !units.has(u));
    if (bad) return fail(violation("unit_unknown", `${bad} is not a unit of this workspace`, "unitIds"));
  }
  if (knownDivisionIds && plan.value.divisionIds) {
    const bad = plan.value.divisionIds.find((d) => !knownDivisionIds.has(d));
    if (bad) return fail(violation("division_unknown", `${bad} is not a division here`, "divisionIds"));
  }

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
  /* THE CATALOGUE IS READ for one thing: what a target is in when the caller
     did not say (incr/0044). It was money.ts's constant; it is the workspace's
     计价规则 now, read the way the pipeline reads it. */
  ctx: PlanningContext & { catalog: CatalogStore },
  input: { scope: TargetScope; amount: number; currency?: string; planId?: string | null },
): Promise<RuleResult<TargetRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "planning.target.create", "data");
  if (!gate.allowed) return denied(gate);
  const policy = await ctx.catalog.getPricingPolicy(ctx.workspaceId);

  // The duplicate check is done against the scope tuple, so the caller gets
  // "a target already exists for this scope" instead of a unique-index error.
  const existing = await ctx.store.listTargets(ctx.workspaceId, { period: input.scope.period });
  const plan = planTargetCreation({
    scope: input.scope,
    targetValue: targetValue(input.scope.metric, input.amount, input.currency ?? policy.defaultCurrency),
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

/* ===== 组织结构 (incr/0051) ===================================================
 *
 * The fourth axis (see lib/org.ts). Reads ride admin.member.view - the
 * organisation is what 成员管理 is organised BY, and whoever may see the
 * members may see the tree. Writes are two ids under admin.manage:
 * admin.org.upsert (a unit, its order, a kind, a template applied) and
 * admin.org.remove (the two deletes). Placing a member is admin.member.scope,
 * the id that already governs what a member may see: which unit they are in
 * is the next batch's data scope, so it takes the scope permission today.
 *
 * FIRST SIGHTING: every read seeds the workspace that has nothing yet, the
 * way presets are materialised (seedPresetRoles). 0051 seeds the workspaces
 * that exist at deploy time; a workspace provisioned later gets the same
 * defaults the first time anybody opens the page.
 */

export interface OrgUnitView extends OrgUnitRecord {
  readonly kind: { readonly id: string; readonly code: string; readonly name: string } | null;
  /** How many members are placed here (not counting the units under it). */
  readonly members: number;
  readonly depth: number;
}

async function ensureOrgSeeded(ctx: PlanningContext): Promise<void> {
  await ctx.store.seedOrgDefaults(ctx.workspaceId);
}

export async function listOrgKinds(ctx: PlanningContext): Promise<RuleResult<OrgKindRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.view", "data");
  if (!gate.allowed) return denied(gate);
  await ensureOrgSeeded(ctx);
  return ok(await ctx.store.listOrgKinds(ctx.workspaceId));
}

/** The tree, flattened in tree order, with its kind, depth and head-count. */
export async function listOrgUnits(ctx: PlanningContext): Promise<RuleResult<OrgUnitView[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.view", "data");
  if (!gate.allowed) return denied(gate);
  await ensureOrgSeeded(ctx);
  const [units, kinds, members] = await Promise.all([
    ctx.store.listOrgUnits(ctx.workspaceId),
    ctx.store.listOrgKinds(ctx.workspaceId),
    ctx.store.listOrgMembers(ctx.workspaceId),
  ]);
  const kindById = new Map(kinds.map((k) => [k.id, k]));
  const count = new Map<string, number>();
  // Head-count per unit: a person in two units is counted in both (0053).
  for (const unitIds of members.values()) for (const unitId of unitIds) count.set(unitId, (count.get(unitId) ?? 0) + 1);
  const depth = new Map<string, number>();
  return ok(
    units.map((u) => {
      const d = u.parentId ? (depth.get(u.parentId) ?? 0) + 1 : 0;
      depth.set(u.id, d);
      const k = kindById.get(u.kindId);
      return { ...u, kind: k ? { id: k.id, code: k.kindCode, name: k.name } : null, members: count.get(u.id) ?? 0, depth: d };
    }),
  );
}

export async function listOrgMembers(ctx: PlanningContext): Promise<RuleResult<Map<string, string[]>>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.view", "data");
  if (!gate.allowed) return denied(gate);
  await ensureOrgSeeded(ctx);
  return ok(await ctx.store.listOrgMembers(ctx.workspaceId));
}

export async function listOrgTemplates(ctx: PlanningContext): Promise<RuleResult<OrgTemplate[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listOrgTemplates());
}

/** Create or edit a unit. Upsert by code, like a territory: the code is the anchor. */
export async function upsertOrgUnit(ctx: PlanningContext, input: OrgUnitDraft): Promise<RuleResult<OrgUnitRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.org.upsert", "data");
  if (!gate.allowed) return denied(gate);
  await ensureOrgSeeded(ctx);
  const [existing, kinds] = await Promise.all([ctx.store.listOrgUnits(ctx.workspaceId), ctx.store.listOrgKinds(ctx.workspaceId)]);
  const plan = planOrgUnit(input, existing, new Set(kinds.map((k) => k.id)));
  if (!plan.ok) return plan as RuleResult<OrgUnitRecord>;
  return ok(await ctx.store.upsertOrgUnit(ctx.workspaceId, plan.value));
}

/**
 * 迁到… (owner, 2026-09-11): change a unit's PARENT, everything else about it
 * held fixed - its own current code, name, kind and leader, re-submitted
 * through the same upsert-by-code path the full edit form uses, so the same
 * cycle check (`parent_cycle`, in `planOrgUnit`) and every other invariant
 * apply exactly as they do there. Not a sibling reorder - see `moveOrgUnit`
 * for that, a different axis entirely.
 */
export async function reparentOrgUnit(
  ctx: PlanningContext,
  input: { id: string; parentId: string | null },
): Promise<RuleResult<OrgUnitRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.org.upsert", "data");
  if (!gate.allowed) return denied(gate);
  const units = await ctx.store.listOrgUnits(ctx.workspaceId);
  const self = units.find((u) => u.id === input.id);
  if (!self) return fail(violation("not_found", "no such unit to move", "id"));
  return upsertOrgUnit(ctx, {
    unitCode: self.unitCode,
    name: self.name,
    parentId: input.parentId,
    kindId: self.kindId,
    leaderSub: self.leaderSub,
  });
}

/** Move a unit among its SIBLINGS - the order is per parent. */
export async function moveOrgUnit(
  ctx: PlanningContext,
  input: { id: string; direction: MoveDirection },
): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.org.upsert", "data");
  if (!gate.allowed) return denied(gate);
  const units = await ctx.store.listOrgUnits(ctx.workspaceId);
  const self = units.find((u) => u.id === input.id);
  if (!self) return fail(violation("not_found", "no such unit to move", "id"));
  const siblings = units.filter((u) => u.parentId === self.parentId);
  const plan = planMove(siblings.map((u) => ({ id: u.id, movable: true })), input.id, input.direction);
  if (!plan.ok) return plan as RuleResult<true>;
  await ctx.store.setOrgUnitOrder(ctx.workspaceId, plan.value);
  return ok(true);
}

/**
 * Delete a unit. REFUSED while anything stands under it (the FK's RESTRICT,
 * said first and in the reader's words) - a tree is dismantled leaf by leaf,
 * never by removing a trunk. Members placed here become un-placed (CASCADE),
 * and the count is returned so the caller can say so.
 */
export async function removeOrgUnit(
  ctx: PlanningContext,
  id: string,
): Promise<RuleResult<{ id: string; unplaced: number; detached: number }>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.org.remove", "data");
  if (!gate.allowed) return denied(gate);
  const [units, members, territories] = await Promise.all([
    ctx.store.listOrgUnits(ctx.workspaceId),
    ctx.store.listOrgMembers(ctx.workspaceId),
    ctx.store.listTerritories(ctx.workspaceId, { includeRetired: true }),
  ]);
  if (!units.some((u) => u.id === id)) return fail(violation("not_found", "no such unit", "id"));
  if (units.some((u) => u.parentId === id)) {
    return fail(violation("unit_has_children", "a unit with units under it cannot be removed", "id"));
  }
  // Placements that go with the unit - a person also placed elsewhere keeps
  // their other units and is counted here all the same (0053).
  const unplaced = [...members.values()].filter((v) => v.includes(id)).length;
  // Territories that listed this unit lose it (0052, CASCADE) - counted first
  // so the caller can say so; a territory with no unit is an ordinary state.
  const detached = territories.filter((t) => t.unitIds.includes(id)).length;
  await ctx.store.removeOrgUnit(ctx.workspaceId, id);
  return ok({ id, unplaced, detached });
}

/**
 * 应用模版 for the organisation: REPLACE the tree with a template. Every unit
 * goes (leaves first), every placement with it, and the template's units come
 * in fresh. The caller confirms; this reports how many members it un-placed.
 */
export async function applyOrgTemplate(
  ctx: PlanningContext,
  key: string,
): Promise<RuleResult<{ key: string; units: number; unplaced: number; detached: number }>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.org.upsert", "data");
  if (!gate.allowed) return denied(gate);
  const template = (await ctx.store.listOrgTemplates()).find((t) => t.key === key);
  if (!template) return fail(violation("template_unknown", `${key} is not a shipped template`, "key"));
  await ensureOrgSeeded(ctx);
  const [units, members, territories] = await Promise.all([
    ctx.store.listOrgUnits(ctx.workspaceId),
    ctx.store.listOrgMembers(ctx.workspaceId),
    ctx.store.listTerritories(ctx.workspaceId, { includeRetired: true }),
  ]);
  // Every territory that listed any unit loses its units with the tree (0052).
  const detached = territories.filter((t) => t.unitIds.length > 0).length;
  // Leaves first: listOrgUnits gives parents before children, so reversed is
  // children before parents, which is the order RESTRICT allows.
  for (const u of [...units].reverse()) await ctx.store.removeOrgUnit(ctx.workspaceId, u.id);
  await ctx.store.applyOrgTemplate(ctx.workspaceId, template);
  return ok({ key, units: template.units.length, unplaced: members.size, detached });
}

/**
 * Place a member in exactly these units - several, one, or none (incr/0053,
 * owner: 支持一人在多个组织内). Their units are what the unit data scope
 * reads: the frame is the union of their subtrees.
 */
export async function setMemberUnits(ctx: PlanningContext, input: { sub: string; unitIds: readonly string[] }): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.scope", "data");
  if (!gate.allowed) return denied(gate);
  await ensureOrgSeeded(ctx);
  const unitIds = [...new Set(input.unitIds)];
  if (unitIds.length > 0) {
    const units = await ctx.store.listOrgUnits(ctx.workspaceId);
    const known = new Set(units.map((u) => u.id));
    if (unitIds.some((id) => !known.has(id))) return fail(violation("unit_unknown", "no such unit", "unitIds"));
  }
  await ctx.store.setMemberUnits(ctx.workspaceId, input.sub, unitIds);
  return ok(true);
}

/* --- 单位类型, the vocabulary ---------------------------------------------- */

export async function saveOrgKind(ctx: PlanningContext, input: { kindCode: string; name: string }): Promise<RuleResult<OrgKindRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.org.upsert", "data");
  if (!gate.allowed) return denied(gate);
  await ensureOrgSeeded(ctx);
  const kindCode = input.kindCode.trim();
  const name = input.name.trim();
  if (!kindCode) return fail(violation("code_required", "a kind needs a code", "kindCode"));
  if (!ORG_KIND_CODE_SHAPE.test(kindCode)) {
    return fail(violation("code_shape", `${kindCode}: a kind code is lower-case letters, digits and underscores`, "kindCode"));
  }
  if (!name) return fail(violation("name_required", "a kind needs a name", "name"));
  return ok(await ctx.store.upsertOrgKind(ctx.workspaceId, { kindCode, name }));
}

export async function moveOrgKind(ctx: PlanningContext, input: { id: string; direction: MoveDirection }): Promise<RuleResult<true>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.org.upsert", "data");
  if (!gate.allowed) return denied(gate);
  const rows = await ctx.store.listOrgKinds(ctx.workspaceId);
  const plan = planMove(rows.map((r) => ({ id: r.id, movable: true })), input.id, input.direction);
  if (!plan.ok) return plan as RuleResult<true>;
  await ctx.store.setOrgKindOrder(ctx.workspaceId, plan.value);
  return ok(true);
}

/** Refused while any unit is of this kind (RESTRICT), in the reader's words. */
export async function removeOrgKind(ctx: PlanningContext, id: string): Promise<RuleResult<{ id: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.org.remove", "data");
  if (!gate.allowed) return denied(gate);
  const rows = await ctx.store.listOrgKinds(ctx.workspaceId);
  if (!rows.some((r) => r.id === id)) return fail(violation("not_found", "no such kind", "id"));
  if ((await ctx.store.countUnitsOfKind(ctx.workspaceId, id)) > 0) {
    return fail(violation("kind_in_use", "units of this kind still exist", "id"));
  }
  await ctx.store.removeOrgKind(ctx.workspaceId, id);
  return ok({ id });
}
