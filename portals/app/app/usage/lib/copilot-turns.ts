import { randomUUID } from "node:crypto";
import { poolFor } from "../../entitlement/quota";
import type { Entitlement } from "../../entitlement/types";
import { recordUsage } from "./buffer";
import type { UsageStore } from "./store";

// yucer's one consumable metric (owner, 2026-09-14: one metric, the copilot conversation turn).
//
// The METRIC is the copilot turn. The ACTION POINT is runCopilotTurn(), where
// the API route and the server action converge, after both gates have let the
// turn through and before the model is called: charged at the start, not on
// the result (the reference implementation's rule), so a model failure is
// still a turn that was asked for. The buffer + flush loop report it to the
// platform; nothing here adjudicates.
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

export function admitTurn(e: Entitlement): TurnAdmission {
  const pool = poolFor(e, COPILOT_TURN_METRIC);
  if (!pool) return { ok: true };
  return pool.remaining > 0 ? { ok: true } : { ok: false, remaining: pool.remaining };
}

/** One admitted turn into the buffer. Returns the idempotency key the flush will carry. */
export async function meterTurn(workspaceId: string, store?: UsageStore): Promise<string> {
  const idempotencyKey = `turn-${randomUUID()}`;
  await recordUsage({ workspaceId, metric: COPILOT_TURN_METRIC, amount: 1, idempotencyKey }, store);
  return idempotencyKey;
}

/** Injected into runCopilotTurn so a test can watch the charge without a store. */
export interface TurnMeter {
  admit(e: Entitlement): TurnAdmission;
  record(workspaceId: string): Promise<string>;
}

export function defaultTurnMeter(): TurnMeter {
  return { admit: admitTurn, record: (workspaceId) => meterTurn(workspaceId) };
}
