"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getCopilotStore } from "../../domains/shared/registry";
import { adjudicate } from "../../domains/copilot/service";
import type { Decision } from "../../domains/copilot/lib/action";

// The only write path from the copilot UI.
//
// Everything security-relevant is re-derived here, on the server, from the
// session:
//
//   - the workspace, so a proposal id from another workspace resolves to nothing
//   - the decider, so nobody can sign someone else's name to an approval
//   - both gates, so a client that renders a button it should not have still
//     cannot use it
//
// The client sends only the selection and the verdict. That is the entire trust
// boundary, and it is why ProposalQueue's onDecide takes ids rather than patches.

export interface AdjudicateResult {
  ok: boolean;
  decided: string[];
  skipped: Array<{ id: string; reason: string }>;
  error?: string;
}

export async function adjudicateProposals(
  ids: string[],
  decision: Decision,
): Promise<AdjudicateResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, decided: [], skipped: [], error: "not_authenticated" };

  if (decision !== "accept" && decision !== "reject") {
    return { ok: false, decided: [], skipped: [], error: "invalid_decision" };
  }

  const result = await adjudicate(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getCopilotStore(),
    },
    ids,
    decision,
  );

  if (!result.ok) {
    return { ok: false, decided: [], skipped: [], error: result.violations[0]?.code ?? "denied" };
  }

  revalidatePath("/copilot");
  return { ok: true, decided: result.value.decided, skipped: result.value.skipped };
}
