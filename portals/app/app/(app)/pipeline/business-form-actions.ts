"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import {
  moveBusinessForm,
  removeBusinessForm,
  setBusinessFormStallOverride,
  upsertBusinessForm,
} from "../../domains/pipeline/service";
import type { BusinessFormRecord } from "../../domains/pipeline/store";
import type { MoveDirection } from "../../domains/shared/ordering";

/* 业务形态目录的写入路径 (incr/0067).
 *
 * Gated on `pipeline.opportunityconfig.manage` inside the service, the stall
 * override included - it rode the same permission on the old 商机类型 since
 * incr/0063 and keeps it here. Returns the violation CODE, never its sentence
 * (TD-010).
 */
export type BusinessFormResult = { ok: boolean; error?: string; businessForm?: BusinessFormRecord };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
}

export async function saveBusinessForm(input: {
  code: string;
  name: string;
}): Promise<BusinessFormResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await upsertBusinessForm(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true, businessForm: r.value };
}

export async function saveBusinessFormStallOverride(
  businessFormId: string,
  stallDaysOverride: number | null,
): Promise<BusinessFormResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await setBusinessFormStallOverride(context(session), {
    businessFormId,
    stallDaysOverride,
  });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  // The review page suggests categories against this number.
  revalidatePath("/forecast");
  return { ok: true, businessForm: r.value };
}

export async function moveBusinessFormAction(
  businessFormId: string,
  direction: MoveDirection,
): Promise<BusinessFormResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveBusinessForm(context(session), { businessFormId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}

export async function removeBusinessFormAction(businessFormId: string): Promise<BusinessFormResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeBusinessForm(context(session), { businessFormId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  return { ok: true };
}
