"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import {
  moveDealType,
  removeDealType,
  setDealTypeStallOverride,
  upsertDealType,
} from "../../domains/pipeline/service";
import type { DealTypeRecord } from "../../domains/pipeline/store";
import type { MoveDirection } from "../../domains/shared/ordering";

/* 商机类型目录的写入路径 (incr/0060-0061, permission unified incr/0063).
 *
 * Both this and saveDealTypeStallOverride now gate on the same
 * `pipeline.opportunityconfig.manage` inside the service - the one
 * permission for all six /admin/opportunity sections. They used to be two
 * separate permissions (`pipeline.dealType` for rename/reorder,
 * `pipeline.forecast` for the stall override, deliberately narrower) - that
 * distinction is gone now that the whole page shares one write authority.
 * Returns the violation CODE, never its sentence (TD-010).
 */
export type DealTypeResult = { ok: boolean; error?: string; dealType?: DealTypeRecord };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
}

export async function saveDealType(input: { code: string; name: string }): Promise<DealTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await upsertDealType(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true, dealType: r.value };
}

export async function saveDealTypeStallOverride(
  dealTypeId: string,
  stallDaysOverride: number | null,
): Promise<DealTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await setDealTypeStallOverride(context(session), { dealTypeId, stallDaysOverride });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  revalidatePath("/forecast");
  return { ok: true, dealType: r.value };
}

export async function moveDealTypeAction(
  dealTypeId: string,
  direction: MoveDirection,
): Promise<DealTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveDealType(context(session), { dealTypeId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}

export async function removeDealTypeAction(dealTypeId: string): Promise<DealTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeDealType(context(session), { dealTypeId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}
