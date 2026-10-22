import type { Entitlement } from "../../entitlement/types";
import { recordUsage } from "./buffer";
import type { UsageStore } from "./store";

// One of yucer's two business counters: a member's copilot conversation turn.
// The other is an independent advisor run; neither adds a limits{} key.
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
// Owner decision, 2026-10-22 (#329): these two independent business counts
// are zero_cost / pool / divisible, monthly reset, with soft limits. Model
// token costs remain Atlas ai.credit. Never deny these actions from a local
// balance; permission and feature gates still apply at their existing callers.

export const COPILOT_TURN_METRIC = "yucer.copilot.turns";

export type TurnAdmission = { ok: true } | { ok: false; remaining: number };

/** Soft business counts are reported, without a local quota decision. */
export function admitMetric(_e: Entitlement, _metric: string): TurnAdmission {
  return { ok: true };
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
