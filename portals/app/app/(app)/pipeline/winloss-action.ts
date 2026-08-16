"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getPipelineStore } from "../../domains/shared/registry";
import { recordWinLossReview } from "../../domains/pipeline/service";
import type { WinLossReason } from "../../domains/pipeline/store";

// Recording a post-mortem.
//
// The outcome is NOT in this signature. It is derived server-side from the
// opportunity's own status, because a review claiming "won" on a lost deal
// would corrupt the one dataset the learning loop reads - and the reviewer is
// taken from the session for the same reason a decider is.

export interface RecordReviewResult {
  ok: boolean;
  error?: string;
}

export async function recordReview(
  opportunityId: string,
  input: { primaryReason: string | null; competitor?: string; lessons?: string },
): Promise<RecordReviewResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await recordWinLossReview(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPipelineStore(),
    },
    opportunityId,
    {
      primaryReason: (input.primaryReason as WinLossReason | null) ?? null,
      competitor: input.competitor?.trim() || null,
      lessons: input.lessons?.trim() || null,
    },
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/pipeline");
  return { ok: true };
}
