"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getCopilotStore } from "../../domains/shared/registry";
import { adjudicate, execute, setAutonomy } from "../../domains/copilot/service";
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
  /** Accepted, then could not be carried out. See below - this is not the same
   *  as skipped, and collapsing them would hide the more serious one. */
  failed: Array<{ id: string; reason: string }>;
  error?: string;
}

export async function adjudicateProposals(
  ids: string[],
  decision: Decision,
): Promise<AdjudicateResult> {
  const session = await resolveAppSession();
  if (!session) {
    return { ok: false, decided: [], skipped: [], failed: [], error: "not_authenticated" };
  }

  if (decision !== "accept" && decision !== "reject") {
    return { ok: false, decided: [], skipped: [], failed: [], error: "invalid_decision" };
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCopilotStore(),
  };

  const result = await adjudicate(ctx, ids, decision);

  if (!result.ok) {
    return {
      ok: false,
      decided: [],
      skipped: [],
      failed: [],
      error: result.violations[0]?.code ?? "denied",
    };
  }

  // ACCEPTING CARRIES IT OUT. The owner's ruling of 2026-09-01: "采纳当然要真实
  // 发生业务动作，不能是假的". Before this, clicking 采纳 moved the proposal row
  // to `accepted` and the deal did not move - the queue emptied, the record
  // said a person had signed, and nothing had happened to the business.
  //
  // THE SAME SESSION CONTEXT, deliberately. execute() hands it to the domain
  // verb, which runs its own gate, so the action happens on the permissions of
  // the person who just signed for it - "人签了字，就用他的权限". Nothing here
  // needs to know which permission that is; asking the pipeline domain is the
  // point.
  //
  // ONE AT A TIME, AND ONE FAILURE DOES NOT SINK THE REST. Each proposal is a
  // separate decision about a separate deal, so a rejected stage move on one
  // must not discard the accepted move on another. This is also why `failed` is
  // its own list: `skipped` means the decision did not apply (already decided,
  // not yours), while `failed` means it DID apply and the world still did not
  // change - the more serious of the two, and invisible if merged.
  const failed: Array<{ id: string; reason: string }> = [];
  if (decision === "accept") {
    for (const id of result.value.decided) {
      const run = await execute(ctx, id);
      if (!run.ok) failed.push({ id, reason: run.violations[0]?.code ?? "denied" });
    }
  }

  revalidatePath("/copilot");
  return { ok: true, decided: result.value.decided, skipped: result.value.skipped, failed };
}

/**
 * Change how much the copilot may do without being asked.
 *
 * The mode is the ONLY thing the client sends. Who signed it comes from the
 * session on the server - a signature a caller could supply is not a signature -
 * and `copilot.autopilot.enable` is checked there too, so a client that renders
 * the buttons it should not have still cannot use them.
 */
export async function changeAutonomy(input: {
  mode: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await setAutonomy(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getCopilotStore(),
    },
    input.mode,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/copilot");
  return { ok: true };
}
