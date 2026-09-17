"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { moveCustomerSize, removeCustomerSize, upsertCustomerSize } from "../../domains/account/service";
import type { MoveDirection } from "../../domains/shared/ordering";

/* 客户规模的写入路径 (incr/0071). Same shape as customer-type-actions.ts. */
export type CustomerSizeResult = { ok: boolean; error?: string };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };
}

export async function saveCustomerSize(input: {
  customerSizeCode: string;
  name: string;
}): Promise<CustomerSizeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await upsertCustomerSize(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  revalidatePath("/account");
  return { ok: true };
}

export async function moveCustomerSizeAction(
  customerSizeId: string,
  direction: MoveDirection,
): Promise<CustomerSizeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveCustomerSize(context(session), { customerSizeId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  return { ok: true };
}

export async function removeCustomerSizeAction(customerSizeId: string): Promise<CustomerSizeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeCustomerSize(context(session), { customerSizeId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  return { ok: true };
}
