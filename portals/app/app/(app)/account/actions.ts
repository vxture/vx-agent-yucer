"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getAccountStore } from "../../domains/shared/registry";
import { recomputeHealth } from "../../domains/account/service";

// Recomputing an account's health.
//
// health_score is derived, so this reads source data and writes the number. It
// never reads the stored score, which is why a wrong value can only be replaced
// and never compounded.

export interface RecomputeResult {
  ok: boolean;
  error?: string;
  score?: number;
}

export async function recomputeAccountHealth(accountId: string): Promise<RecomputeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await recomputeHealth(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getAccountStore(),
    },
    accountId,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath(`/account/${accountId}`);
  revalidatePath("/account");
  return { ok: true, score: result.value.score };
}
