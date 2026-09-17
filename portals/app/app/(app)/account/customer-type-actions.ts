"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { moveCustomerType, removeCustomerType, upsertCustomerType } from "../../domains/account/service";
import type { MoveDirection } from "../../domains/shared/ordering";

/* 客户类型的写入路径 (incr/0071).
 *
 * Gated on `account.upsert` inside the service, same as 行业 - deciding what
 * customer types exist is the same authority as deciding what a customer is.
 * Returns the violation CODE, never its sentence (TD-010).
 */
export type CustomerTypeResult = { ok: boolean; error?: string };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };
}

export async function saveCustomerType(input: {
  customerTypeCode: string;
  name: string;
}): Promise<CustomerTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await upsertCustomerType(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  revalidatePath("/account");
  return { ok: true };
}

export async function moveCustomerTypeAction(
  customerTypeId: string,
  direction: MoveDirection,
): Promise<CustomerTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveCustomerType(context(session), { customerTypeId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  return { ok: true };
}

export async function removeCustomerTypeAction(customerTypeId: string): Promise<CustomerTypeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeCustomerType(context(session), { customerTypeId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  return { ok: true };
}
