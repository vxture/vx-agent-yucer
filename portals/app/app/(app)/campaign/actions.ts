"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getStrategyStore } from "../../domains/shared/registry";
import { transitionCampaign } from "../../domains/strategy/service";
import { CAMPAIGN_STATUSES, type CampaignStatus } from "../../domains/strategy/lib/lifecycle";

// Moving a campaign through its lifecycle.
//
// Completing is the one that carries a guard: a campaign with outstanding
// executions cannot be completed, because "we finished" and "we stopped looking"
// are different claims and only one of them belongs in an attribution report.
// The service enforces it; the surface reports the count back.

export interface TransitionResult {
  ok: boolean;
  error?: string;
}

export async function moveCampaign(id: string, to: string): Promise<TransitionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, error: "unknown_status" };
  }

  const result = await transitionCampaign(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    id,
    to as CampaignStatus,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/campaign");
  return { ok: true };
}
