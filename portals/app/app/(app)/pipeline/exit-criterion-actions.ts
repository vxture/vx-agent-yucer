"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { removeExitCriterion, saveExitCriterion } from "../../domains/pipeline/service";

/* 阶段退出条件的写入路径 (incr/0087). Gated on pipeline.opportunityconfig.manage
 * inside the service - opportunity configuration, like the stage catalog it
 * belongs to. Returns the violation CODE, never its sentence (TD-010). */

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
}

export async function saveExitCriterionAction(input: {
  id?: string;
  stageCode: string;
  kind: string;
  param: Record<string, unknown>;
  name: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await saveExitCriterion(context(session), input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  revalidatePath("/pipeline", "layout");
  return { ok: true };
}

export async function removeExitCriterionAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await removeExitCriterion(context(session), id);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  revalidatePath("/pipeline", "layout");
  return { ok: true };
}
