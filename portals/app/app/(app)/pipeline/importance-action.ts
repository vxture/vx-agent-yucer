"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { importanceScheme } from "../../domains/account/service";
import { setOpportunityImportance } from "../../domains/pipeline/service";

// 设定重要度 (incr/0090, YC-065 R11). The levels are the account domain's
// rows, read through its gated scheme; the pipeline verb only checks the
// chosen id is one of the deal axis and records who and when.

export async function setDealImportance(
  opportunityId: string,
  levelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const scheme = await importanceScheme({ ...base, store: session.stores.account() });
  if (!scheme.ok) return { ok: false, error: scheme.violations[0]!.code };
  const result = await setOpportunityImportance(
    { ...base, store: session.stores.pipeline() },
    opportunityId,
    levelId,
    new Set(scheme.value.opportunity.map((l) => l.id)),
  );
  if (!result.ok) return { ok: false, error: result.violations[0]!.code };
  revalidatePath(`/pipeline/${opportunityId}`);
  revalidatePath("/pipeline");
  return { ok: true };
}
