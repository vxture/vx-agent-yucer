"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession, tenantIdOf } from "../lib/session";
import { can } from "../../authz/decide";
import { listAccounts } from "../../domains/account/service";
import { matchSignalAccount, promoteSignal, registerSignal, rescoreSignal, triageSignal } from "../../domains/signal/service";
import type { SignalRegistration } from "../../domains/signal/lib/intelligence";
import type { ExitReason } from "../../domains/shared/funnel-exit";
import type { SignalAction } from "../components/signal-queue";
import { getArdaConfig } from "../../platform/arda/source";
import { runArdaSync } from "../../platform/arda/sync";

export interface SignalActionResult {
  ok: boolean;
  error?: string;
  score?: number | null;
  leadId?: string;
  leadNo?: string;
  recorded?: number;
  duplicates?: number;
}

type Session = NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>;
const ctxOf = (session: Session) => ({
  workspaceId: session.workspaceId, sub: session.user.sub,
  holder: session.authz, entitlement: session.entitlement, store: session.stores.signal(),
});

function refresh() {
  for (const path of ["/signal", "/lead", "/"]) revalidatePath(path);
}

/** Failures remain visible and retryable; no SQL/error text reaches the browser. */
async function mutate(work: (session: Session) => Promise<SignalActionResult>): Promise<SignalActionResult> {
  try {
    const session = await resolveAppSession();
    if (!session) return { ok: false, error: "not_authenticated" };
    const result = await work(session);
    if (result.ok || result.recorded !== undefined) refresh();
    return result;
  } catch { return { ok: false, error: "save_failed" }; }
}

/** Validate a customer through its owning service, including read/data-scope gates. */
async function visibleAccount(session: Session, accountId: string): Promise<boolean> {
  const result = await listAccounts({ ...ctxOf(session), store: session.stores.account() });
  return result.ok && result.value.some(account => account.id === accountId);
}

export async function actOnSignal(signalId: string, action: SignalAction): Promise<SignalActionResult> {
  return mutate(async session => {
    if (action !== "rescore" && action !== "duplicate") return { ok: false, error: "unknown_status" };
    const result = action === "rescore"
      ? await rescoreSignal(ctxOf(session), signalId)
      : await triageSignal(ctxOf(session), signalId, "duplicate", { reasonCode: "duplicate" });
    if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
    return { ok: true };
  });
}

export async function confirmSignalPromotion(signalId: string, companyName: string): Promise<SignalActionResult> {
  return mutate(async session => {
    const result = await promoteSignal(ctxOf(session), signalId, { companyName });
    return result.ok ? { ok: true, leadId: result.value.lead.id, leadNo: result.value.lead.leadNo }
      : { ok: false, error: result.violations[0]?.code ?? "denied" };
  });
}

export async function saveSignalRegistration(input: SignalRegistration): Promise<SignalActionResult> {
  return mutate(async session => {
    if (input.accountId && !await visibleAccount(session, input.accountId)) return { ok: false, error: "not_found" };
    const result = await registerSignal(ctxOf(session), input);
    return result.ok ? { ok: true } : { ok: false, error: result.violations[0]?.code ?? "denied" };
  });
}

export async function dismissSignal(signalId: string, reasonCode: ExitReason, note: string | null): Promise<SignalActionResult> {
  return mutate(async session => {
    const result = await triageSignal(ctxOf(session), signalId, "dismissed", { reasonCode, note });
    return result.ok ? { ok: true } : { ok: false, error: result.violations[0]?.code ?? "denied" };
  });
}

export async function markSignalDuplicate(signalId: string): Promise<SignalActionResult> {
  return actOnSignal(signalId, "duplicate");
}

export async function matchSignal(signalId: string, accountId: string): Promise<SignalActionResult> {
  return mutate(async session => {
    if (!await visibleAccount(session, accountId)) return { ok: false, error: "not_found" };
    const result = await matchSignalAccount(ctxOf(session), signalId, accountId);
    return result.ok ? { ok: true } : { ok: false, error: result.violations[0]?.code ?? "denied" };
  });
}

/** On demand only. The browser never supplies a workspace, tenant or feed URL. */
export async function fetchSignalUpdates(): Promise<SignalActionResult> {
  return mutate(async session => {
    const gate = can(session.authz, session.entitlement, "signal.feed.ingest", "data");
    if (!gate.allowed) return { ok: false, error: "permission_denied" };
    if (!getArdaConfig().enabled) return { ok: false, error: "signal_feed_disabled" };
    const tenantId = tenantIdOf(session);
    if (!tenantId) return { ok: false, error: "not_authenticated" };
    const result = await runArdaSync({ workspaces: [{ workspaceId: session.workspaceId, tenantId }] });
    if (result.status === "disabled") return { ok: false, error: "signal_feed_disabled" };
    if (result.failed || result.unmapped) return { ok: false, error: "signal_sync_failed", recorded: result.recorded, duplicates: result.duplicates };
    if (result.skipped) return { ok: false, error: "feature_not_in_tier" };
    return { ok: true, recorded: result.recorded, duplicates: result.duplicates };
  });
}
