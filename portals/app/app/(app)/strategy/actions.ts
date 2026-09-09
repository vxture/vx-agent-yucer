"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getStrategyStore } from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import {
  createPlan,
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
} from "../../domains/strategy/lib/lifecycle";
import type { MoveDirection } from "../../domains/shared/ordering";

// Moving a plan through its lifecycle.
//
// The gate is chosen by the DESTINATION inside the service: approving checks
// strategy.plan.approve, every other move checks strategy.plan.update.
//
// Worth knowing rather than assuming: both action ids resolve to the same
// permission (strategy.write) in today's catalog, so the split is nominal - a
// member who may edit a plan may also approve it. Making approval a real
// separation of duties is a role-catalog change, not a change here.

export interface TransitionResult {
  ok: boolean;
  error?: string;
}

export async function movePlan(id: string, to: string): Promise<TransitionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

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
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/strategy");
  return { ok: true };
}

/**
 * Creating a plan.
 *
 * The neighbour of `movePlan` above, which shipped first and could only ever
 * move plans that db-init had put there (TD-016).
 */
export async function createStrategyPlan(input: {
  planNo: string;
  name: string;
  period: string;
  objective: string | null;
  ownerSub: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await createPlan(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    input,
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/strategy");
  return { ok: true };
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
  input: {
    name: string;
    period: string;
    objective: string | null;
    ownerSub: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await editPlan(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    id,
    input,
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/strategy");
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
  planId: string | null;
  priority: number;
  status: string;
  criteria: { industries: readonly string[]; regions: readonly string[] };
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
    },
    { ...input, status: input.status as SegmentStatus },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/strategy");
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
  return { ok: true };
}
