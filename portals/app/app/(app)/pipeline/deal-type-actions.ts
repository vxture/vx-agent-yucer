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

/* 商机类型目录的写入路径 (incr/0060-0061).
 *
 * Gated on `pipeline.dealType.manage` inside the service - granted far more
 * broadly than the stage catalog's own manage permission (see incr/0061's
 * own note). Returns the violation CODE, never its sentence (TD-010).
 *
 * saveDealTypeStallOverride is a SEPARATE write path (incr/0062): the service
 * verb it calls is gated on `pipeline.forecast.categorize`, not
 * `pipeline.dealType.manage` - narrower, the same as forecast_threshold's own
 * write permission.
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
