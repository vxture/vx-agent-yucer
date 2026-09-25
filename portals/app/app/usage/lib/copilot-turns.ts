import { isUnlimited, poolFor } from "../../entitlement/quota";
import type { Entitlement } from "../../entitlement/types";
import { recordUsage } from "./buffer";
import type { UsageStore } from "./store";

// yucer's one consumable metric (owner, 2026-09-14: one metric, the copilot
// conversation turn; reaffirmed 2026-09-15 after the metricKey review - no
// second counter and no limits{} keys; the review's judgements are recorded
// in the metering section of docs/20-specs/40-capability-matrix.md).
//
// The METRIC is the copilot turn. The ACTION POINTS are runCopilotTurn() and
// streamCopilotTurn() - the only two places a question reaches the model. In
// both, admission runs right after the two gates and the charge lands once
// the question row exists and before the model is called: charged at the
// start, not on the result (the reference implementation's rule), so a model
// failure is still a turn that was asked for. The buffer + flush loop report
// it to the platform; nothing here adjudicates.
//
// THE IDEMPOTENCY KEY IS THE BUSINESS OBJECT, not a random id (the tenderforge
// precedent: metric + object id). The object of a turn is the member's
// question, i.e. the user message row, which is why the charge waits for
// appendMessage(): a retried flush, a double-submitted form and a replayed
// request all name the same message, and the platform collapses them into one
// event. A UUID minted per call made every retry a fresh charge - the
// opposite of what the key exists for.
//
// ADMISSION reads the C2 envelope's quota pool for the metric. No pool means
// the platform sold no quota for it - the sales axis decides, not this code -
// so the turn is not gated. A pool with nothing left refuses with the fleet
// code QUOTA_EXCEEDED (X-1: the four refusal codes are copied, never
// invented), and the caller answers 409 (the callee section: 409 is quota).
//
// The metric must be REGISTERED on the platform before consume accepts it
// (unknown_metric otherwise); until then the events stay buffered, which the
// reference calls out as the normal, non-breaking state.

export const COPILOT_TURN_METRIC = "yucer.copilot.turns";

export type TurnAdmission = { ok: true } | { ok: false; remaining: number };

/**
 * Admission for one metric, read off the C2 envelope's pool. Shared by both
 * metrics (yucer.copilot.turns, yucer.advisor.runs).
 *
 * TD-035: this still reads `remaining` and decides locally. The owner's ruling
 * (2026-09-24, YC-042) is that the platform sends the admit result and the
 * product holds no quota numbers; C2 carries no such field yet, so the pool
 * read stays until the platform names one - then this function becomes a
 * read of that field and nothing else.
 */
export function admitMetric(e: Entitlement, metric: string): TurnAdmission {
  const pool = poolFor(e, metric);
  if (!pool) return { ok: true };
  // -1 = unlimited (same convention as limits{}, checked the same way withinCap
  // checks it) - a naive `remaining > 0` would read an unlimited pool's -1 as
  // exhausted, denying a workspace that was never supposed to be gated at all.
  if (isUnlimited(pool.limit)) return { ok: true };
  return pool.remaining > 0 ? { ok: true } : { ok: false, remaining: pool.remaining };
}

export function admitTurn(e: Entitlement): TurnAdmission {
  return admitMetric(e, COPILOT_TURN_METRIC);
}

/** The key one turn is charged under: the metric and the question it was asked in. */
export function turnIdempotencyKey(messageId: string): string {
  return `${COPILOT_TURN_METRIC}:${messageId}`;
}

/**
 * One admitted turn into the buffer, keyed by the user message that IS the
 * turn. Returns the idempotency key the flush will carry.
 */
export async function meterTurn(workspaceId: string, messageId: string, store?: UsageStore): Promise<string> {
  const idempotencyKey = turnIdempotencyKey(messageId);
  await recordUsage({ workspaceId, metric: COPILOT_TURN_METRIC, amount: 1, idempotencyKey }, store);
  return idempotencyKey;
}

/** Injected into the two turn services so a test can watch the charge without a store. */
export interface TurnMeter {
  admit(e: Entitlement): TurnAdmission;
  record(workspaceId: string, messageId: string): Promise<string>;
}

export function defaultTurnMeter(): TurnMeter {
  return { admit: admitTurn, record: (workspaceId, messageId) => meterTurn(workspaceId, messageId) };
}

/**
 * For a model call that is an ADVISOR RUN, not a member's turn (runAdvisor
 * reuses the turn machinery for its tool loop): the run is admitted and
 * charged once under yucer.advisor.runs, so charging a turn as well would bill
 * one piece of work twice under two names.
 */
export const ADVISOR_RUN_TURN_METER: TurnMeter = {
  admit: () => ({ ok: true }),
  record: async () => "",
};
