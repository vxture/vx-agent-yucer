"use server";

import { getAuthzStore } from "../../authz/store";
import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getCatalogStore, getStrategyStore } from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import {
  createPlan, publishStrategy, reviseStrategy, discardStrategyDraft,
  editPlan,
  moveSegment,
  removeSegment,
  setSegmentStatus,
  transitionPlan,
  upsertSegment,
} from "../../domains/strategy/service";
import {
  PLAN_STATUSES,
  SEGMENT_STATUSES,
  type PlanStatus,
  type SegmentStatus,
  type NewPlanDraft,
  type PlanEdit,
  type SegmentCriteria,
} from "../../domains/strategy/lib/lifecycle";
import type { MoveDirection } from "../../domains/shared/ordering";

// Moving a plan through its lifecycle.
//
// The gate is chosen by the DESTINATION inside the service: approving checks
// strategy.plan.approve, every other move checks strategy.plan.update.
//
// Editing uses strategy.write; approval uses the separate strategy.approve
// permission. Content edits are draft-only, independently of those gates.

export interface TransitionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

export async function movePlan(id: string, to: string, editToken?: number): Promise<TransitionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  if(to === "approved")return {ok:false,error:"controlled_release_required"};
  if(!Number.isSafeInteger(editToken) || !editToken || editToken<1)return {ok:false,error:"strategy_draft_conflict"};
  if (!(PLAN_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, error: "unknown_status" };
  }

  const result = await transitionPlan(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    id,
    to as PlanStatus,
    {expectedEditToken:editToken},
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/strategy", "layout");
  revalidatePath("/segment");
  return { ok: true };
}

/**
 * Creating a plan.
 *
 * The neighbour of `movePlan` above, which shipped first and could only ever
 * move plans that db-init had put there (TD-016).
 */
export async function createStrategyPlan(input: NewPlanDraft, autoNumber = false): Promise<TransitionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await createPlan(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
      catalog: getCatalogStore(),
      memberDirectory: getAuthzStore(),
    },
    input,
    { autoNumber: autoNumber === true },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/strategy", "layout");
  revalidatePath("/segment");
  return { ok: true, id:result.value.id };
}

/**
 * Editing a plan that already exists.
 *
 * BY ID, unlike a segment: `plan_no` is a real anchor with no UPDATE grant and
 * every downstream row points at the plan's id, so there is no reason to route
 * an edit through the number. The form is reached with ?no= only because that
 * is what a person reading the roster has in front of them; the page resolves
 * it to the id before the write.
 */
export async function savePlan(
  id: string,
  input: PlanEdit,
  editToken: number,
): Promise<TransitionResult> {
  if(!Number.isSafeInteger(editToken)||editToken<1)return {ok:false,error:"strategy_draft_conflict"};
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await editPlan(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
      catalog: getCatalogStore(),
      memberDirectory: getAuthzStore(),
    },
    id,
    input,
    {expectedEditToken:editToken},
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/strategy", "layout");
  revalidatePath("/segment");
  return { ok: true };
}

export async function startStrategyRevision(id:string):Promise<TransitionResult & {id?:string}> {
  const session=await resolveAppSession();if(!session)return {ok:false,error:"not_authenticated"};
  const result=await reviseStrategy({workspaceId:session.workspaceId,sub:session.user.sub,holder:session.authz,entitlement:session.entitlement,store:getStrategyStore()},id);
  if(!result.ok)return {ok:false,error:result.violations[0]?.code ?? "denied"};
  revalidatePath("/strategy","layout");return {ok:true,id:result.value.id};
}
export async function publishStrategyVersion(id:string,editToken:number):Promise<TransitionResult> {
  const session=await resolveAppSession();if(!session)return {ok:false,error:"not_authenticated"};
  const result=await publishStrategy({workspaceId:session.workspaceId,sub:session.user.sub,holder:session.authz,entitlement:session.entitlement,
    store:getStrategyStore(),catalog:getCatalogStore(),memberDirectory:getAuthzStore()},id,editToken);
  if(!result.ok)return {ok:false,error:result.violations[0]?.code ?? "denied"};
  revalidatePath("/strategy","layout");revalidatePath("/campaign");revalidatePath("/segment");return {ok:true};
}

export async function discardStrategyVersion(id: string, editToken: number): Promise<TransitionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const result = await discardStrategyDraft({ workspaceId: session.workspaceId, sub: session.user.sub,
    holder: session.authz, entitlement: session.entitlement, store: getStrategyStore() }, id, editToken);
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/strategy", "layout");
  return { ok: true };
}

/**
 * Creating or editing a market segment.
 *
 * By CODE, not by id. `campaign.segment_id` is a real foreign key, but
 * `account.segment_code` points here by plain string with nothing enforcing it -
 * so the code is the identity, and an edit finds the row by it and leaves it
 * alone. The column locks agree: segment_code carries no UPDATE grant.
 */
export async function saveSegment(input: {
  segmentCode: string;
  name: string;
  priority: number;
  status: string;
  criteria: SegmentCriteria;
  solutionIds?: readonly string[];
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  // Narrowed here rather than cast. This is the edge where a value typed only
  // as `string` by the browser becomes one the rule layer can reason about, and
  // the same check movePlan does above for the same reason.
  if (!(SEGMENT_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "unknown_status" };
  }

  const result = await upsertSegment(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
      catalog: getCatalogStore(),
    },
    { ...input, status: input.status as SegmentStatus },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/strategy", "layout");
  revalidatePath("/segment");
  return { ok: true };
}

export async function changeSegmentStatus(
  segmentId: string,
  status: "active" | "paused" | "retired",
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await setSegmentStatus(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    { segmentId, status },
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/segment");
  revalidatePath("/strategy", "layout");
  return { ok: true };
}

export async function moveSegmentRow(
  segmentId: string,
  direction: MoveDirection,
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveSegment(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    { segmentId, direction },
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/segment");
  revalidatePath("/strategy", "layout");
  return { ok: true };
}

export async function deleteSegment(
  segmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  // HOW MANY ACCOUNTS CARRY THE CODE is an ACCOUNT-domain question, so it is
  // asked through that domain's gated read and handed to the strategy rule -
  // rather than the strategy store reaching across into a table it does not
  // own (ADR-001). A read this member may not do refuses the delete, which is
  // the safe direction.
  const [segments, accounts] = await Promise.all([
    (async () => {
      const { listSegments } = await import("../../domains/strategy/service");
      return listSegments({ ...base, store: getStrategyStore() });
    })(),
    listAccounts({ ...base, store: session.stores.account() }),
  ]);
  if (!segments.ok) return { ok: false, error: segments.violations[0]?.code ?? "denied" };
  if (!accounts.ok) return { ok: false, error: accounts.violations[0]?.code ?? "denied" };

  const target = segments.value.find((g) => g.id === segmentId);
  if (!target) return { ok: false, error: "not_found" };
  const carrying = accounts.value.filter((a) => a.segmentCode === target.segmentCode).length;

  const r = await removeSegment(
    { ...base, store: getStrategyStore() },
    { segmentId, accountsCarrying: carrying },
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/segment");
  revalidatePath("/strategy", "layout");
  return { ok: true };
}
