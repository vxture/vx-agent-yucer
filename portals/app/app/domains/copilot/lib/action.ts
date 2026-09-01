// D8 agent_action lifecycle - the human-machine boundary
// (docs/20-specs/30-business-rules.md section 7; ADR-003).
//
// This is the product's highest-priority rule and it outranks every single-domain
// rule: the copilot PROPOSES, a human DECIDES. Everything the agent wants to
// write becomes an agent_action first.
//
//     proposed -> accepted -> executed | failed
//              -> rejected
//              -> expired
//              -> executed                (autopilot only, and still recorded)
//
// Three invariants carry the auditability claim, and each is enforced twice -
// here, in readable code, and at the database, which revokes UPDATE on
// payload / rationale / confidence outright:
//
//   1. There is no `accepted` without a human on the record. A decision with no
//      decider is the exact shape of an agent quietly approving itself.
//   2. The proposal's content is frozen at creation. An audit must be able to
//      answer "what did the agent recommend AT THE TIME", not "what does the
//      record say it recommended now".
//   3. Autopilot does not skip the record, only the human. It writes the same
//      row with decided_by_sub deliberately NULL, which is what marks the action
//      as machine-executed rather than human-approved. Leaving that field null
//      is the signal, not an omission.

import { fail, ok, violation, type RuleResult, type Violation } from "../../shared/result";
// autonomy.ts imports only a TYPE from this file, which is erased, so the
// runtime graph is one-directional.
import { CONFIDENCE_FLOOR, isExecutable } from "./autonomy";

export const ACTION_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "executed",
  "failed",
  "expired",
] as const;

export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const SUBJECT_TYPES = [
  "account",
  "lead",
  "opportunity",
  "project",
  "campaign",
  "plan",
] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

// TERMINAL_ACTION_STATUSES and isTerminalStatus were deleted on 2026-09-01.
//
// The allowlist entry that held them said "the constant is used directly by
// callers; the wrapper adds nothing" - and the first half was not true either.
// NOTHING used either one. Every rule in this file gates on the POSITIVE side
// (`status === "proposed"`, `!== "proposed"`, `=== "accepted"`), because each
// one knows the single state it can act from; none of them ever needed the set
// of states nothing happens from. A concept the code never asks about is not a
// definition worth pinning, and the review rule here is explicit: a name still
// listed with no caller gets deleted.

export interface AgentAction {
  id: string;
  status: ActionStatus;
  actionType: string;
  /**
   * Which capability proposed this - ADR-015. Frozen with payload/rationale.
   *
   * Nullable because historical rows have none. Backfilling a guess would
   * manufacture accuracy data that reads as measured, and a gap is visible
   * where a guess is not.
   */
  capability: string | null;
  subjectType: SubjectType;
  subjectId: string;
  /** The model's own record. Frozen at creation. */
  payload: Record<string, unknown>;
  rationale: string | null;
  confidence: number | null;
  decidedBySub: string | null;
  decidedAt: Date | null;
  executedAt: Date | null;
  createdAt: Date;
}

/** The whitelisted columns a decision may write. Mirrors 98_column_locks.sql. */
export interface ActionPatch {
  status: ActionStatus;
  decidedBySub?: string | null;
  decidedAt?: Date | null;
  executedAt?: Date | null;
}

export type Decision = "accept" | "reject";

export interface DecideInput {
  decision: Decision;
  /** The human signing for it. Mandatory - there is no accept without one. */
  decidedBySub: string;
  decidedAt?: Date;
}

/**
 * A human accepting or rejecting a proposal.
 *
 * Rejecting also requires a named decider. A rejection is a decision someone is
 * accountable for, and an anonymous one leaves "who decided not to act on this"
 * unanswerable - which is the question asked after a deal is lost.
 */
export function planDecision(action: AgentAction, input: DecideInput): RuleResult<ActionPatch> {
  const checks: Violation[] = [];

  if (action.status !== "proposed") {
    checks.push(
      violation(
        "not_pending",
        `action is ${action.status}; only a proposed action can be decided`,
        "status",
      ),
    );
  }
  if (!input.decidedBySub?.trim()) {
    checks.push(
      violation(
        "decider_required",
        "a decision needs the human who made it; there is no accepted action without a decided_by_sub",
        "decidedBySub",
      ),
    );
  }
  if (checks.length > 0) return { ok: false, violations: checks };

  return ok({
    status: input.decision === "accept" ? "accepted" : "rejected",
    decidedBySub: input.decidedBySub.trim(),
    decidedAt: input.decidedAt ?? new Date(),
  });
}

/**
 * Executing an accepted action.
 *
 * `autopilot` is the ONLY way an action reaches executed without passing through
 * accepted, and the caller must have already run all three of the autopilot
 * gates (tier, permission, workspace opt-in - see authz/gate.ts). This function
 * cannot check them: it is pure and has no entitlement in scope. What it can do
 * is refuse to let the transition happen by accident.
 */
export function planExecution(
  action: AgentAction,
  opts: { autopilot?: boolean; executedAt?: Date } = {},
): RuleResult<ActionPatch> {
  const executedAt = opts.executedAt ?? new Date();

  if (action.status === "accepted") {
    if (!action.decidedBySub) {
      // Belt and braces: an accepted row with no decider means something wrote
      // around planDecision, and executing it would launder an unapproved action.
      return fail(
        violation(
          "accepted_without_decider",
          "accepted action has no decided_by_sub; refusing to execute an unsigned approval",
          "decidedBySub",
        ),
      );
    }
    return ok({ status: "executed", executedAt });
  }

  if (action.status === "proposed") {
    if (!opts.autopilot) {
      return fail(
        violation(
          "human_decision_required",
          "a proposed action must be accepted by a human before execution; autopilot is an explicit, separately gated authorization",
          "status",
        ),
      );
    }
    // The record is still written in full. decided_by_sub stays null on purpose:
    // that null IS the marker that no human signed for this.
    return ok({ status: "executed", decidedBySub: null, decidedAt: null, executedAt });
  }

  return fail(
    violation("not_executable", `action is ${action.status} and cannot be executed`, "status"),
  );
}

/** Recording an execution failure. Terminal - a retry is a new proposal, so the
 * record of the failed attempt survives instead of being overwritten. */
export function planFailure(action: AgentAction): RuleResult<ActionPatch> {
  if (action.status !== "accepted" && action.status !== "proposed") {
    return fail(violation("not_executable", `action is ${action.status}`, "status"));
  }
  return ok({ status: "failed" });
}

export const DEFAULT_PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Expire a proposal nobody decided.
 *
 * The spec is explicit that an undecided proposal must not silently disappear:
 * it becomes `expired`, which is a visible outcome. A proposal that vanishes
 * leaves a member sure they saw a recommendation and unable to find it.
 */
export function planExpiry(
  action: AgentAction,
  opts: { now?: Date; ttlMs?: number } = {},
): RuleResult<ActionPatch> {
  const now = opts.now ?? new Date();
  const ttl = opts.ttlMs ?? DEFAULT_PROPOSAL_TTL_MS;

  if (action.status !== "proposed") {
    return fail(violation("not_pending", `action is ${action.status}`, "status"));
  }
  if (now.getTime() - action.createdAt.getTime() < ttl) {
    return fail(violation("not_yet_expired", "the proposal is still within its decision window", "createdAt"));
  }
  // No decider: nobody decided, which is the whole point of this state.
  return ok({ status: "expired" });
}

// --- Immutability -----------------------------------------------------------

const FROZEN_KEYS = ["payload", "rationale", "confidence"] as const;

// --- Batch adjudication -----------------------------------------------------

export interface BatchDecisionResult {
  /** Actions whose patch was produced. */
  accepted: Array<{ id: string; patch: ActionPatch }>;
  /** Actions that could not be decided, each with why. */
  skipped: Array<{ id: string; violations: Violation[] }>;
}

/**
 * Decide many proposals at once.
 *
 * ADR-003 recorded the risk this addresses by name: one-at-a-time confirmation
 * becomes the bottleneck the moment the agent scores a feed and produces
 * hundreds of proposals, and a bottleneck is what makes people turn the human
 * step off entirely. Batching keeps the accountability (every row still gets a
 * decided_by_sub) while making the accountable act affordable.
 *
 * Partial application is deliberate: one stale proposal in a batch of two
 * hundred must not discard the other hundred and ninety-nine decisions. The
 * caller reports what was skipped.
 */
export function planBatchDecision(
  actions: readonly AgentAction[],
  input: DecideInput,
): BatchDecisionResult {
  const out: BatchDecisionResult = { accepted: [], skipped: [] };
  for (const a of actions) {
    const r = planDecision(a, input);
    if (r.ok) out.accepted.push({ id: a.id, patch: r.value });
    else out.skipped.push({ id: a.id, violations: r.violations });
  }
  return out;
}

/**
 * Guard rail for the batch UI: how risky is it to wave this batch through?
 *
 * Not a permission - the two gates already decided who may adjudicate. This is
 * the number the confirmation dialog should be built around, so that "accept
 * 200 low-confidence proposals that each rewrite a deal" cannot look like
 * "accept 200 items".
 */
export function batchRisk(actions: readonly AgentAction[]): {
  count: number;
  lowConfidenceCount: number;
  subjectTypes: SubjectType[];
  actionTypes: string[];
  /** Mean confidence over proposals that reported one, or null if none did. */
  meanConfidence: number | null;
  /**
   * How many of these the product cannot perform itself.
   *
   * IN THE DIALOG THAT ASKS, because since 2026-09-01 accepting carries the
   * action out, and for these it does not - the agreement is recorded and a
   * person does the work. Told afterwards it is a surprise; told here it is
   * part of what is being decided.
   */
  manualCount: number;
} {
  const withConfidence = actions.filter((a) => typeof a.confidence === "number");
  const total = withConfidence.reduce((n, a) => n + (a.confidence ?? 0), 0);
  return {
    count: actions.length,
    // CONFIDENCE_FLOOR, not a literal 60. This read `< 60` while the autonomy
    // rule read CONFIDENCE_FLOOR, which is the same doubt with two answers and
    // exactly the drift that constant exists to prevent: moving the floor would
    // have changed what runs unwatched without changing what the dialog warns
    // about.
    lowConfidenceCount: actions.filter((a) => (a.confidence ?? 0) < CONFIDENCE_FLOOR).length,
    subjectTypes: [...new Set(actions.map((a) => a.subjectType))],
    actionTypes: [...new Set(actions.map((a) => a.actionType))].sort(),
    meanConfidence: withConfidence.length ? total / withConfidence.length : null,
    manualCount: actions.filter((a) => !isExecutable(a.actionType)).length,
  };
}
