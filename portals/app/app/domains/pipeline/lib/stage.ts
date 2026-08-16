// D6 opportunity stage machine (docs/20-specs/30-business-rules.md section 1).
//
// The stage machine is the product's most-touched rule, and the one with the
// most ways to be quietly wrong. Three properties are load-bearing:
//
//   1. EVERY change journals an event. Velocity and conversion analytics read
//      opportunity_stage_event; nothing may reconstruct stage history from
//      updated_at, because updated_at only remembers the last write.
//   2. Entering a terminal stage moves THREE things together - stage, status and
//      closed_at. A won deal with a null closed_at is invisible to every
//      period-scoped report that exists.
//   3. The default win rate is a SUGGESTION. Once a human overrides it, later
//      stage moves must stop rewriting it, or the machine silently discards a
//      judgement a salesperson was asked to make.

import { allOf, fail, ok, violation, type RuleResult, type Violation } from "../../shared/result";
import type { ForecastCategory } from "./forecast";

export const STAGES = [
  "qualify",
  "discover",
  "validate",
  "propose",
  "negotiate",
  "won",
  "lost",
] as const;

export type Stage = (typeof STAGES)[number];

export const TERMINAL_STAGES = ["won", "lost"] as const;
export type TerminalStage = (typeof TERMINAL_STAGES)[number];

export type OpportunityStatus = "open" | "won" | "lost" | "abandoned";

/** Suggested win rate per stage. Not a lock - see applyProbability below. */
export const DEFAULT_PROBABILITY: Record<Stage, number> = {
  qualify: 10,
  discover: 25,
  validate: 50,
  propose: 70,
  negotiate: 90,
  won: 100,
  lost: 0,
};

/** Open stages in selling order, used for direction and funnel analysis. */
export const OPEN_STAGE_ORDER: readonly Stage[] = [
  "qualify",
  "discover",
  "validate",
  "propose",
  "negotiate",
];

export function isStage(v: string): v is Stage {
  return (STAGES as readonly string[]).includes(v);
}

export function isTerminal(stage: Stage): stage is TerminalStage {
  return stage === "won" || stage === "lost";
}

/**
 * Was the win rate set by a human rather than by the stage machine?
 *
 * Derived rather than stored: the schema has no override flag, and adding one
 * would need a DDL increment plus a column-lock change for something that is
 * already knowable. If the value differs from the current stage's default, a
 * person put it there. The blind spot is honest and small - overriding to
 * exactly the default reads as "not overridden" - and the audit trail of who
 * changed it lives in opportunity_stage_event.reason either way.
 */
export function isProbabilityOverridden(opp: Pick<OpportunitySnapshot, "stage" | "probability">): boolean {
  return opp.probability != null && opp.probability !== DEFAULT_PROBABILITY[opp.stage];
}

export interface OpportunitySnapshot {
  stage: Stage;
  status: OpportunityStatus;
  probability: number | null;
  closedAt: Date | null;
  hasWinLossReview?: boolean;
}

export interface StageChangeInput {
  to: Stage;
  /** Free-text why. Required for anything unusual - see below. */
  reason?: string;
  /** Null marks an agent-driven move; the audit column allows it explicitly. */
  actorSub?: string | null;
  occurredAt?: Date;
  /**
   * Explicit intent to leave a terminal stage. Reopening a closed deal rewrites
   * a reported number, so it must be deliberate rather than a mis-click on a
   * stage picker.
   */
  reopen?: boolean;
}

/** The append-only journal row. */
export interface StageEvent {
  fromStage: Stage;
  toStage: Stage;
  reason: string | null;
  actorSub: string | null;
  occurredAt: Date;
}

/** The whitelisted column updates that accompany the event. */
export interface OpportunityPatch {
  stage: Stage;
  status: OpportunityStatus;
  closedAt: Date | null;
  probability?: number;
  /**
   * Moved WITH the stage, because the two are not independent.
   *
   * `closed` is not a judgement - planCategoryChange refuses it on an open deal
   * and refuses anything else on a terminal one - so a stage move that left the
   * category behind produced a row neither rule would accept, and one that no
   * later edit could repair.
   *
   * The reporting consequence is the real one: a won deal still sitting in
   * `commit` is counted by rollUp() as revenue still to come, while
   * closedAmount stays empty. That is won money reported as pipeline, which is
   * the same number justified twice.
   */
  forecastCategory?: ForecastCategory;
}

export interface StageChangePlan {
  event: StageEvent;
  patch: OpportunityPatch;
  /** True when the caller must also create the win/loss review in the same unit
   * of work. Entering a terminal stage requires exactly one. */
  requiresWinLossReview: boolean;
}

/**
 * Plan a stage change. Returns the journal row and the column patch together,
 * because writing one without the other is precisely the bug the journal exists
 * to prevent.
 */
export function planStageChange(
  current: OpportunitySnapshot,
  input: StageChangeInput,
): RuleResult<StageChangePlan> {
  const occurredAt = input.occurredAt ?? new Date();
  const checks: Array<Violation | null> = [];

  if (!isStage(input.to)) {
    return fail(violation("unknown_stage", `${String(input.to)} is not a stage`, "stage"));
  }

  // The database CHECK forbids from = to outright. Catching it here gives a
  // usable message instead of a constraint violation, and keeps a no-op from
  // polluting the velocity journal with a zero-length interval.
  if (current.stage === input.to) {
    checks.push(
      violation("stage_unchanged", `already in ${input.to}; a no-op must not be journalled`, "stage"),
    );
  }

  if (isTerminal(current.stage) && !input.reopen) {
    checks.push(
      violation(
        "terminal_stage",
        `${current.stage} is terminal; reopening rewrites an already-reported outcome and needs explicit intent`,
        "stage",
      ),
    );
  }

  // Reopening and going backwards both revise a story someone already told, so
  // both must say why. The reason is the only durable record of the decision.
  if (input.reopen && !input.reason?.trim()) {
    checks.push(violation("reason_required", "reopening a closed opportunity requires a reason", "reason"));
  }
  if (!input.reopen && isRegression(current.stage, input.to) && !input.reason?.trim()) {
    checks.push(
      violation("reason_required", `moving back from ${current.stage} to ${input.to} requires a reason`, "reason"),
    );
  }

  const invalid = checks.filter((c): c is Violation => c !== null);
  if (invalid.length > 0) return { ok: false, violations: invalid };

  const patch: OpportunityPatch = {
    stage: input.to,
    status: statusFor(input.to),
    // Entering a terminal stage stamps the close; leaving one clears it, because
    // a reopened deal that keeps its old closed_at lands in a closed period it
    // is no longer part of.
    closedAt: isTerminal(input.to) ? occurredAt : null,
  };

  const nextProbability = applyProbability(current, input.to);
  if (nextProbability != null) patch.probability = nextProbability;

  // Entering a terminal stage books the deal; leaving one puts it back in the
  // most conservative bucket rather than reclaiming whatever it was committed
  // at before. A reopened deal has to earn `commit` again - restoring it
  // silently would let a closed-then-reopened deal keep a commitment nobody
  // re-made.
  if (isTerminal(input.to)) patch.forecastCategory = "closed";
  else if (isTerminal(current.stage)) patch.forecastCategory = "pipeline";

  return allOf(
    {
      event: {
        fromStage: current.stage,
        toStage: input.to,
        reason: input.reason?.trim() || null,
        actorSub: input.actorSub ?? null,
        occurredAt,
      },
      patch,
      // One review per opportunity (unique on opportunity_id). Reopening and
      // re-closing therefore updates the existing review rather than adding one.
      requiresWinLossReview: isTerminal(input.to) && !current.hasWinLossReview,
    },
    [],
  );
}

/** Status implied by a stage. abandoned is a human decision, never inferred. */
export function statusFor(stage: Stage): OpportunityStatus {
  if (stage === "won") return "won";
  if (stage === "lost") return "lost";
  return "open";
}

/**
 * The new win rate, or null to leave it alone.
 *
 * Terminal stages are absolute rather than suggested: a won deal is 100% and a
 * lost one is 0% whatever anyone typed earlier. Everywhere else, a human
 * override wins and the machine keeps its hands off.
 */
export function applyProbability(
  current: Pick<OpportunitySnapshot, "stage" | "probability">,
  to: Stage,
): number | null {
  if (isTerminal(to)) return DEFAULT_PROBABILITY[to];
  if (isProbabilityOverridden(current)) return null;
  return DEFAULT_PROBABILITY[to];
}

/** True when `to` is earlier in the selling order than `from`. */
export function isRegression(from: Stage, to: Stage): boolean {
  const a = OPEN_STAGE_ORDER.indexOf(from);
  const b = OPEN_STAGE_ORDER.indexOf(to);
  if (a === -1 || b === -1) return false; // terminal stages are not on the line
  return b < a;
}

/**
 * Manually set the win rate. Separated from the stage machine because it is a
 * different decision with a different permission, and because it is what makes
 * later stage moves stop touching the number.
 */
export function planProbabilityOverride(
  current: OpportunitySnapshot,
  probability: number,
): RuleResult<{ probability: number }> {
  if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
    return fail(violation("probability_range", "probability must be an integer 0-100", "probability"));
  }
  if (isTerminal(current.stage)) {
    return fail(
      violation(
        "terminal_probability_fixed",
        `a ${current.stage} opportunity is fixed at ${DEFAULT_PROBABILITY[current.stage]}%`,
        "probability",
      ),
    );
  }
  return ok({ probability });
}
