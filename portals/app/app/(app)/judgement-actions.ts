"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "./lib/session";
import { getCopilotStore } from "../domains/shared/registry";
import { snoozeJudgement } from "../domains/judgement/service";
import type { Urgency } from "../domains/judgement/lib/judgement";

// Deferring a judgement, from the screen it was shown on.
//
// The session is resolved HERE rather than trusted from the caller: a server
// action is a public endpoint, and the workspace and member it writes for must
// come from the cookie, never from arguments a client could choose.

export async function dismissJudgement(
  judgementId: string,
  urgency: Urgency,
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await snoozeJudgement(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getCopilotStore(),
    },
    { judgementId, urgency },
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  // The shell's board counts the same feed, so both have to be rebuilt - a
  // queue that empties while the sidebar still says 2 is worse than not
  // filtering at all.
  revalidatePath("/", "layout");
  return { ok: true };
}
