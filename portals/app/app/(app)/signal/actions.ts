"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getSignalStore } from "../../domains/shared/registry";
import { promoteSignal, rescoreSignal, triageSignal } from "../../domains/signal/service";
import type { SignalAction } from "../components/signal-queue";

// The only write path from the signal inbox.
//
// The client sends an id and a VERB. Everything else - the workspace, the
// actor, both gates, and which rule applies - is re-derived here from the
// session. A client that could send a patch could set a score by hand, and the
// score is the thing the whole domain is trusted for.

export interface SignalActionResult {
  ok: boolean;
  error?: string;
  /** Present after a rescore, so the UI can explain the new number. */
  score?: number | null;
}

export async function actOnSignal(
  signalId: string,
  action: SignalAction,
): Promise<SignalActionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getSignalStore(),
  };

  const result =
    action === "rescore"
      ? await rescoreSignal(ctx, signalId)
      : action === "promote"
        ? await promoteSignal(ctx, signalId)
        : await triageSignal(ctx, signalId, action === "duplicate" ? "duplicate" : "dismissed");

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }

  revalidatePath("/signal");
  return {
    ok: true,
    score: action === "rescore" ? (result.value as { signal: { score: number | null } }).signal.score : undefined,
  };
}
