"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { setContactRecencyPolicy } from "../../domains/account/field-service";
import type { ContactRecencyPolicy } from "../../domains/account/lib/contact-recency-policy";
import { setRenewalPolicy } from "../../domains/delivery/service";
import type { RenewalPolicy } from "../../domains/delivery/lib/renewal";
import { getFieldStore, getDeliveryStore } from "../../domains/shared/registry";

/* 联系提醒阈值的写入路径 (incr/0065).
 *
 * Gated on `admin.reminderthreshold.manage` inside the service. Returns the
 * violation CODE, never its sentence (TD-010).
 */
export async function saveContactRecencyPolicy(
  input: ContactRecencyPolicy,
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await setContactRecencyPolicy(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getFieldStore(),
    },
    input,
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/reminder");
  // The home feed reads these on every load; the decision-chain panel lives
  // under every account detail page.
  revalidatePath("/");
  revalidatePath("/account", "layout");
  return { ok: true };
}

/* 续约提醒窗口的写入路径 (incr/0066).
 *
 * Gated on `admin.reminderthreshold.manage` inside the service. Returns the
 * violation CODE, never its sentence (TD-010).
 */
export async function saveRenewalPolicy(
  input: RenewalPolicy,
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await setRenewalPolicy(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getDeliveryStore(),
    },
    input,
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/reminder");
  revalidatePath("/renewal");
  return { ok: true };
}
