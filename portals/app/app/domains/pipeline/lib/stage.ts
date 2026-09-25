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
//
// STAGE CODES ARE A WORKSPACE'S OWN DATA (incr/0057, owner 2026-09-13): what
// used to be a hardcoded seven-value union - STAGES/DEFAULT_PROBABILITY/
// TERMINAL_STAGES/OPEN_STAGE_ORDER - is now a per-workspace catalog a tenant
// can rename, reorder, re-price and extend. This module stays a PURE,
// SYNCHRONOUS rule module regardless: every catalog-aware function below
// takes a trailing `catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS`
// parameter rather than reading a store itself, the same shape incr/0041
// (forecast thresholds) already proved out - `suggestCategory(deal, now,
// thresholds = DEFAULT_FORECAST_THRESHOLDS)`. Only service.ts, which holds
// `ctx.store`, resolves the workspace's actual rows and threads them through;
// forecast.ts/health.ts/brief.ts/copilot's executor and this file's own unit
// tests all keep working unchanged against the shipped default, for free.
//
// `Stage` was `(typeof STAGES)[number]`, a closed literal union; it is now a
// plain `string`, validated against a catalog at runtime with `isStage`
// rather than by the compiler - the same trade every prior vocabulary
// (win-loss reason, industry) already made once its codes became tenant data.

import type { ExitSnapshot } from "./exit-criteria";
import { allOf, fail, ok, violation, type RuleResult, type Violation } from "../../shared/result";
import { OPPORTUNITY_ABANDON_REASONS, OPPORTUNITY_LOSE_REASONS } from "../../shared/funnel-exit";
import type { ForecastCategory } from "./forecast";
import { DEFAULT_STAGE_DEFINITIONS, type StageDefinition } from "./stage-vocab";

export type Stage = string;
export type OpportunityStatus = "open" | "won" | "lost" | "abandoned";

// The catalog data (DEFAULT_STAGE_DEFINITIONS/StageDefinition) and the
// vocabulary-editing rules (planStageDefinition/planStageRemoval) live in
// ./stage-vocab, not here - the seven names are seed data (CJK containment
// exempts vocab files, not rule modules), and re-exporting keeps every
// existing `from "./stage"` import unchanged.
export { DEFAULT_STAGE_DEFINITIONS, type StageDefinition, planStageDefinition, planStageRemoval } from "./stage-vocab";
export type { StageDefinitionDraft } from "./stage-vocab";

export function isStage(v: string, catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS): v is Stage {
  return catalog.some((s) => s.code === v);
}

export function isTerminal(stage: Stage, catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS): boolean {
  return catalog.find((s) => s.code === stage)?.isTerminal ?? false;
}

/** Open stages in the workspace's own selling order, used for direction and
 *  funnel analysis - was the static OPEN_STAGE_ORDER export. */
export function openStageOrder(catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS): readonly Stage[] {
  return [...catalog]
    .filter((s) => !s.isTerminal)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.code);
}

/** Was the static DEFAULT_PROBABILITY[stage] lookup. */
export function defaultProbabilityFor(stage: Stage, catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS): number {
  return catalog.find((s) => s.code === stage)?.defaultProbability ?? 0;
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
export function isProbabilityOverridden(
  opp: Pick<OpportunitySnapshot, "stage" | "probability">,
  catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS,
): boolean {
  return opp.probability != null && opp.probability !== defaultProbabilityFor(opp.stage, catalog);
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
  /**
   * Why the deal was lost - required when `to` is a lost stage (YC-065 R6).
   * Written to funnel_exit in the same transaction as the stage change, so a
   * lost deal can no longer close without saying why.
   */
  exitReason?: { code: string; note?: string | null };
  /**
   * The current stage's exit check at the moment of the move (deal batch 5b,
   * YC-065 R1). Moving FORWARD past unmet criteria is allowed - never a hard
   * block - but needs a reason, and the snapshot goes into the journal with
   * it. Absent (a caller that could not compute it): nothing is enforced and
   * the journal says "not recorded".
   */
  exitCheck?: ExitSnapshot;
}

/** The funnel_exit row a close writes alongside its stage change. */
export interface DealExit {
  outcome: "lost" | "abandoned";
  reasonCode: string;
  note: string | null;
}

/** The append-only journal row. */
export interface StageEvent {
  fromStage: Stage;
  toStage: Stage;
  reason: string | null;
  actorSub: string | null;
  occurredAt: Date;
  /** The stage left, as checked when it was left (incr/0088). Absent / null = not recorded. */
  exitCheck?: ExitSnapshot | null;
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
  /** Present when the move closes the deal as lost: its exit reason. */
  exit?: DealExit;
}

/**
 * Plan a stage change. Returns the journal row and the column patch together,
 * because writing one without the other is precisely the bug the journal exists
 * to prevent.
 */
export function planStageChange(
  current: OpportunitySnapshot,
  input: StageChangeInput,
  catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS,
): RuleResult<StageChangePlan> {
  const occurredAt = input.occurredAt ?? new Date();
  const checks: Array<Violation | null> = [];

  if (!isStage(input.to, catalog)) {
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

  // AN ABANDONED DEAL IS CLOSED WHATEVER STAGE IT SITS AT (R6: the stage keeps
  // where it was given up). Without this, any stage move silently resets the
  // status through statusFor and resurrects a deal nobody decided to reopen.
  const abandoned = current.status === "abandoned";
  if (abandoned && !input.reopen) {
    checks.push(
      violation("abandoned_closed", "an abandoned deal must be reopened, with a reason, before it moves", "stage"),
    );
  }

  // A LOSS SAYS WHY (R6). Checked here so the surface can ask for it before
  // anything is written; the reason goes to funnel_exit with the move.
  const losing = statusFor(input.to, catalog) === "lost";
  let exit: DealExit | undefined;
  if (losing) {
    const code = input.exitReason?.code;
    const note = input.exitReason?.note?.trim() ? input.exitReason.note.trim() : null;
    if (!code) {
      checks.push(violation("exit_reason_required", "a lost deal needs a reason", "exitReason"));
    } else if (!(OPPORTUNITY_LOSE_REASONS as readonly string[]).includes(code)) {
      checks.push(violation("exit_reason_invalid", `${code} is not a reason a deal is lost for`, "exitReason"));
    } else if (code === "other" && !note) {
      checks.push(violation("exit_note_required", "'other' needs a sentence saying what it was", "exitReason"));
    } else {
      exit = { outcome: "lost", reasonCode: code, note };
    }
  }

  if (isTerminal(current.stage, catalog) && !input.reopen) {
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
  if (!input.reopen && isRegression(current.stage, input.to, catalog) && !input.reason?.trim()) {
    checks.push(
      violation("reason_required", `moving back from ${current.stage} to ${input.to} requires a reason`, "reason"),
    );
  }
  // 未满足推进须理由 (R1): forward past unmet exit criteria is a reminder with
  // a required answer, not a block. A loss is not "moving past" - it has its
  // own reason (R6).
  const forward =
    !input.reopen && !isRegression(current.stage, input.to, catalog) && statusFor(input.to, catalog) !== "lost";
  if (forward && (input.exitCheck?.unmet.length ?? 0) > 0 && !input.reason?.trim()) {
    checks.push(
      violation("exit_unmet_reason_required", "moving on past unmet exit criteria requires a reason", "reason"),
    );
  }

  const invalid = checks.filter((c): c is Violation => c !== null);
  if (invalid.length > 0) return { ok: false, violations: invalid };

  const patch: OpportunityPatch = {
    stage: input.to,
    status: statusFor(input.to, catalog),
    // Entering a terminal stage stamps the close; leaving one clears it, because
    // a reopened deal that keeps its old closed_at lands in a closed period it
    // is no longer part of.
    closedAt: isTerminal(input.to, catalog) ? occurredAt : null,
  };

  const nextProbability = applyProbability(current, input.to, catalog);
  if (nextProbability != null) patch.probability = nextProbability;

  // Entering a terminal stage books the deal; leaving one puts it back in the
  // most conservative bucket rather than reclaiming whatever it was committed
  // at before. A reopened deal has to earn `commit` again - restoring it
  // silently would let a closed-then-reopened deal keep a commitment nobody
  // re-made.
  if (isTerminal(input.to, catalog)) patch.forecastCategory = "closed";
  else if (isTerminal(current.stage, catalog) || abandoned) patch.forecastCategory = "pipeline";

  return allOf(
    {
      event: {
        fromStage: current.stage,
        toStage: input.to,
        reason: input.reason?.trim() || null,
        actorSub: input.actorSub ?? null,
        occurredAt,
        exitCheck: input.exitCheck ?? null,
      },
      patch,
      // One review per opportunity (unique on opportunity_id). Reopening and
      // re-closing therefore updates the existing review rather than adding one.
      requiresWinLossReview: isTerminal(input.to, catalog) && !current.hasWinLossReview,
      ...(exit ? { exit } : {}),
    },
    [],
  );
}

export interface AbandonInput {
  reasonCode: string;
  note?: string | null;
  occurredAt?: Date;
}

export interface AbandonPlan {
  patch: { status: "abandoned"; closedAt: Date; forecastCategory: "closed" };
  exit: DealExit;
}

/**
 * Give a deal up (YC-065 R6). 放弃 is OUR decision to stop pursuing it, not a
 * loss: status becomes abandoned, closed_at is stamped, the stage STAYS where
 * it was - where we gave up is exactly what the review wants to know - and the
 * category becomes closed so no roll-up counts it (rollUp excludes the status).
 * The reason is required and goes to funnel_exit in the same transaction.
 */
export function planAbandon(current: Pick<OpportunitySnapshot, "status">, input: AbandonInput): RuleResult<AbandonPlan> {
  if (current.status !== "open") {
    return fail(violation("not_open", `only an open deal can be abandoned; this one is ${current.status}`, "status"));
  }
  const note = input.note?.trim() ? input.note.trim() : null;
  if (!input.reasonCode) return fail(violation("exit_reason_required", "abandoning needs a reason", "reasonCode"));
  if (!(OPPORTUNITY_ABANDON_REASONS as readonly string[]).includes(input.reasonCode)) {
    return fail(violation("exit_reason_invalid", `${input.reasonCode} is not a reason to abandon`, "reasonCode"));
  }
  if (input.reasonCode === "other" && !note) {
    return fail(violation("exit_note_required", "'other' needs a sentence saying what it was", "note"));
  }
  const at = input.occurredAt ?? new Date();
  return ok({
    patch: { status: "abandoned", closedAt: at, forecastCategory: "closed" },
    exit: { outcome: "abandoned", reasonCode: input.reasonCode, note },
  });
}

/** Status implied by a stage. abandoned is a human decision, never inferred. */
export function statusFor(stage: Stage, catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS): OpportunityStatus {
  const row = catalog.find((s) => s.code === stage);
  if (row?.isWon) return "won";
  if (row?.isTerminal) return "lost";
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
  catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS,
): number | null {
  if (isTerminal(to, catalog)) return defaultProbabilityFor(to, catalog);
  if (isProbabilityOverridden(current, catalog)) return null;
  return defaultProbabilityFor(to, catalog);
}

/** True when `to` is earlier in the workspace's own selling order than `from`. */
export function isRegression(from: Stage, to: Stage, catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS): boolean {
  const order = openStageOrder(catalog);
  const a = order.indexOf(from);
  const b = order.indexOf(to);
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
  catalog: readonly StageDefinition[] = DEFAULT_STAGE_DEFINITIONS,
): RuleResult<{ probability: number }> {
  if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
    return fail(violation("probability_range", "probability must be an integer 0-100", "probability"));
  }
  if (isTerminal(current.stage, catalog)) {
    return fail(
      violation(
        "terminal_probability_fixed",
        `a ${current.stage} opportunity is fixed at ${defaultProbabilityFor(current.stage, catalog)}%`,
        "probability",
      ),
    );
  }
  return ok({ probability });
}
