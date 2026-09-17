"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { moveCustomerNature, removeCustomerNature, upsertCustomerNature } from "../../domains/account/service";
import type { MoveDirection } from "../../domains/shared/ordering";

/* 客户性质的写入路径 (incr/0072). Same shape as the other two customer-*-actions.ts. */
export type CustomerNatureResult = { ok: boolean; error?: string };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };
}

export async function saveCustomerNature(input: {
  customerNatureCode: string;
  name: string;
}): Promise<CustomerNatureResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await upsertCustomerNature(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  revalidatePath("/account");
  return { ok: true };
}

export async function moveCustomerNatureAction(
  customerNatureId: string,
  direction: MoveDirection,
): Promise<CustomerNatureResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveCustomerNature(context(session), { customerNatureId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  return { ok: true };
}

export async function removeCustomerNatureAction(customerNatureId: string): Promise<CustomerNatureResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeCustomerNature(context(session), { customerNatureId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  return { ok: true };
}
