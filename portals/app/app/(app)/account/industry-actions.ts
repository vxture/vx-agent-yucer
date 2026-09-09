"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { moveIndustry, removeIndustry, upsertIndustry } from "../../domains/account/service";

/* 行业分类的写入路径 (incr/0040).
 *
 * Gated on `account.upsert` inside the service - deciding what industries
 * exist is the same authority as deciding what a customer is. Returns the
 * violation CODE, never its sentence (TD-010).
 */
export type IndustryResult = { ok: boolean; error?: string };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };
}

export async function saveIndustry(input: {
  industryCode: string;
  name: string;
}): Promise<IndustryResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await upsertIndustry(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  revalidatePath("/account");
  return { ok: true };
}

export async function moveIndustryAction(
  industryId: string,
  direction: "up" | "down",
): Promise<IndustryResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await moveIndustry(context(session), { industryId, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  return { ok: true };
}

export async function removeIndustryAction(industryId: string): Promise<IndustryResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeIndustry(context(session), { industryId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/industry");
  return { ok: true };
}
