import type { Entitlement } from "../../entitlement/types";
import { recordUsage } from "./buffer";
import { admitMetric, type TurnAdmission } from "./copilot-turns";
import type { UsageStore } from "./store";

// yucer's second consumable metric (owner, 2026-09-24, YC-042 §04): ONE
// ADVISOR RUN THAT REACHED THE MODEL, manual or background. However many
// model or tool calls the run makes, it is 1; a cache hit is 0.
//
// THE ACTION POINT is runAdvisor() - the only door an advisor capability
// reaches the model through. Charged at the start, like a turn: after the run
// is admitted and before the model is called, so a model failure is still the
// run that was asked for.
//
// THE IDEMPOTENCY KEY IS THE RUN, and the run id is the input fingerprint
// (domains/copilot/lib/briefing.ts): the same input re-triggered - a retry, a
// concurrent save, a daily re-check - names the same run, and the platform
// collapses it into one event.
//
// The metric name is a literal, never configuration: it must hit the
// platform's registry, and a configurable name could report to a key that does
// not exist - accepted, never billed. Until the platform registers it,
// consume answers unknown_metric and the events stay buffered (the normal
// state, 10-platform-registration-checklist).

export const ADVISOR_RUN_METRIC = "yucer.advisor.runs";

export function admitAdvisorRun(e: Entitlement): TurnAdmission {
  return admitMetric(e, ADVISOR_RUN_METRIC);
}

/** The key one run is charged under: the metric and the run. */
export function advisorRunKey(runId: string): string {
  return `${ADVISOR_RUN_METRIC}:${runId}`;
}

export async function meterAdvisorRun(workspaceId: string, runId: string, store?: UsageStore): Promise<string> {
  const idempotencyKey = advisorRunKey(runId);
  await recordUsage({ workspaceId, metric: ADVISOR_RUN_METRIC, amount: 1, idempotencyKey }, store);
  return idempotencyKey;
}

/** Injected into runAdvisor so a test can watch the charge without a store. */
export interface AdvisorMeter {
  admit(e: Entitlement): TurnAdmission;
  record(workspaceId: string, runId: string): Promise<string>;
}

export function defaultAdvisorMeter(): AdvisorMeter {
  return { admit: admitAdvisorRun, record: (workspaceId, runId) => meterAdvisorRun(workspaceId, runId) };
}
