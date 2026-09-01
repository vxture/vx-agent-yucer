import type { AgentAction } from "./action";

// How much the copilot may do without being asked.
//
// The owner's rulings of 2026-09-01, in order:
//
//   1. "采纳当然要真实发生业务动作" - accepting a proposal has to do the thing.
//      Until now accepting left the row at `accepted` and the deal did not
//      move, which made the whole adjudication theatre.
//   2. Three postures, not a boolean: act on the safe ones and ask about the
//      rest; ask about everything; act on everything.
//   3. High risk is IRREVERSIBLE **or** LOW CONFIDENCE.
//
// ADR-003 is not weakened by any of this. The machine still proposes and a
// human still decides - what the workspace decides, once, is which decisions it
// wants to keep making one at a time. That is a decision a person makes, in a
// setting, with their name on it (agent_autonomy.decided_by_sub).

export const AUTONOMY_MODES = ["ask_high_risk", "ask_always", "autonomous"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export function isAutonomyMode(v: string): v is AutonomyMode {
  return (AUTONOMY_MODES as readonly string[]).includes(v);
}

/**
 * Action types the copilot may carry out on its own, when the mode allows it.
 *
 * ONE LIST, TWO MEANINGS, and they have to be the same list. An entry here says
 * both "this is reversible enough to do unwatched" AND "the executor knows how
 * to do it" - `executor.ts` consults this very constant before dispatching, so
 * a type that is auto-approved and then unperformable cannot exist. That
 * combination is the worst of both readings: nobody looked at it, and nothing
 * happened.
 *
 * REVERSIBILITY IS THE LINE, not the model's opinion of itself. `advance_stage`
 * writes to our own records and journals every move in opportunity_stage_event,
 * so somebody can walk it back.
 *
 * `draft_outreach` is deliberately absent and is the reason the line is drawn
 * here rather than at confidence: a message sent to a customer cannot be
 * unsent, and no confidence score makes it retractable. It is also why this
 * batch never had to decide what "draft an outreach" should produce - under
 * this rule a person sees it every time, whatever the mode.
 *
 * `promote_signal` WAS here and was removed on 2026-09-01, when wiring the
 * executor showed it cannot be performed as modelled: agent_action's
 * subject_type CHECK allows account, lead, opportunity, project, campaign and
 * plan - there is no `signal` - so a proposal has no way to name which signal
 * to promote (the demo seeds one against a LEAD id, which promoteSignal would
 * read as a signal id and not find). It was the exact failure this list now
 * prevents: called safe, auto-approved under ask_high_risk, and impossible to
 * carry out. Making it executable means widening the CHECK or redefining the
 * action; both are rulings, not wiring.
 *
 * An action type absent from this set is high risk BY DEFAULT. That is not
 * caution for its own sake: `action_type` is FREE TEXT from the model - the
 * tool schema offers "e.g. advance_stage, update_forecast_category,
 * draft_email" and nothing validates what comes back - so the set of things
 * that can arrive here is open, and only an allowlist can bound it.
 */
export const EXECUTABLE_ACTIONS: readonly string[] = ["advance_stage"];

/**
 * Below this, the model is not sure enough to act unwatched.
 *
 * 60 because it is the line the product already draws: the copilot page says
 * "其中 N 条置信度低于 60%，值得先读理由", so a reader has been told for months
 * that 60 is where a recommendation stops speaking for itself. Inventing a
 * second threshold would give the product two answers about the same doubt.
 *
 * A proposal with NO confidence is treated as below it. Absent is not high -
 * a model that declined to say how sure it was has not earned an unwatched
 * write.
 */
export const CONFIDENCE_FLOOR = 60;

export type RiskReason = "irreversible" | "low_confidence";

/**
 * Why this proposal is high risk, or empty when it is not.
 *
 * BOTH REASONS ARE REPORTED, not the first one found. A page that says only
 * "low confidence" about an outreach draft would invite somebody to fix the
 * confidence and expect it to go through.
 */
export function riskOf(action: Pick<AgentAction, "actionType" | "confidence">): RiskReason[] {
  const reasons: RiskReason[] = [];
  if (!EXECUTABLE_ACTIONS.includes(action.actionType)) reasons.push("irreversible");
  if (action.confidence === null || action.confidence < CONFIDENCE_FLOOR) {
    reasons.push("low_confidence");
  }
  return reasons;
}

export type AutonomyVerdict =
  | { readonly kind: "act"; readonly mode: AutonomyMode }
  | { readonly kind: "ask"; readonly reasons: readonly RiskReason[] };

/**
 * Does this proposal need a person, under this workspace's posture?
 *
 * A PURE FUNCTION OF THE PROPOSAL AND THE MODE. It says nothing about whether
 * the caller is entitled or permitted to act autonomously - `autopilotAuthorized`
 * answers that, and it needs three independent yeses of its own. This is the
 * fourth question and it is asked last: even a workspace that bought autopilot,
 * granted the permission and switched it on still does not get to skip a
 * decision this rule says is a person's.
 */
export function decideAutonomy(
  action: Pick<AgentAction, "actionType" | "confidence">,
  mode: AutonomyMode,
): AutonomyVerdict {
  if (mode === "ask_always") {
    // Not "no reasons" - the mode is the reason, and reporting an empty list
    // here would let a caller conclude the proposal was safe and merely
    // waiting, which is a different sentence.
    return { kind: "ask", reasons: riskOf(action) };
  }
  if (mode === "autonomous") return { kind: "act", mode };

  const reasons = riskOf(action);
  return reasons.length > 0 ? { kind: "ask", reasons } : { kind: "act", mode };
}
