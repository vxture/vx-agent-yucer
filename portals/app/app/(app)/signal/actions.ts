"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getSignalStore } from "../../domains/shared/registry";
import {
  matchSignalAccount,
  promoteSignal,
  rescoreSignal,
  triageSignal,
} from "../../domains/signal/service";
import type { ExitReason } from "../../domains/shared/funnel-exit";
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
    store: session.stores.signal(),
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


const ctxOf = (session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) => ({
  workspaceId: session.workspaceId,
  sub: session.user.sub,
  holder: session.authz,
  entitlement: session.entitlement,
  store: session.stores.signal(),
});

/**
 * 忽略, with the reason (design_yucer_110 batch D, on incr/0033's table).
 *
 * WITHOUT IT THE SAME SIGNAL COMES BACK NEXT WEEK and nobody can tell whether
 * it was looked at and rejected or never looked at - which is the difference
 * between a filter working and a filter being ignored.
 */
export async function dismissSignal(
  signalId: string,
  reasonCode: ExitReason,
  note: string | null,
): Promise<SignalActionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const r = await triageSignal(ctxOf(session), signalId, "dismissed", { reasonCode, note });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/signal");
  return { ok: true };
}

/** 判重 - accepting the scout's proposal that this repeats one already here. */
export async function markSignalDuplicate(signalId: string): Promise<SignalActionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  // NO REASON ASKED FOR. A duplicate explains itself - it names the signal it
  // repeats - and making somebody type a sentence for it teaches them to type
  // anything.
  const r = await triageSignal(ctxOf(session), signalId, "duplicate", { reasonCode: "duplicate" });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/signal");
  return { ok: true };
}

/** 匹配客户 - accepting the scout's proposal about which customer this is. */
export async function matchSignal(
  signalId: string,
  accountId: string,
): Promise<SignalActionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const r = await matchSignalAccount(ctxOf(session), signalId, accountId);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/signal");
  return { ok: true };
}
