// D7 delivery and revenue (docs/20-specs/30-business-rules.md section 6).
//
// The chain's endpoint is not "won", it is "the money arrived". The gap between
// planned and actual revenue is the final measure of whether a strategy landed,
// which is why this domain exists at all and why it stops at collection rather
// than becoming a project-management tool.
//
// One rule here is a hard cross-check rather than a preference: a project with
// an overdue instalment MUST NOT be green. Delivery status is reported by the
// people delivering, and "we are fine" alongside "they have not paid" is the
// single most common way a failing engagement stays green until it is a crisis.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { isNonNegative, type Money } from "../../shared/money";

export const REVENUE_STATUSES = ["planned", "invoiced", "settled", "overdue", "written_off"] as const;
export type RevenueStatus = (typeof REVENUE_STATUSES)[number];

export type ProjectHealth = "green" | "amber" | "red";

/**
 * Mirrors chk_project_milestone_status. An ARRAY with the type derived from it,
 * like REVENUE_STATUSES above and STAGES in the pipeline: a hand-written union
 * beside a hand-written array is two lists that drift, and the surface offering
 * a status the CHECK refuses is how that drift is discovered.
 */
export const MILESTONE_STATUSES = ["pending", "in_progress", "done", "missed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/**
 * planned -> invoiced -> settled is the happy path. `overdue` is a state a
 * pending instalment falls into, and is recoverable in both directions -
 * invoicing an overdue instalment or collecting it are both normal. `settled`
 * and `written_off` are terminal: money that arrived did arrive, and a write-off
 * is an accounting decision that is reversed by a new schedule, not by editing
 * this row.
 */
/**
 * EXPORTED so the interface can offer exactly the legal moves.
 *
 * The lifecycle control in this product reads the machine's own map rather than
 * listing every status and letting the machine refuse four of five - a menu
 * that says no for reasons the reader cannot predict teaches them the product
 * is arbitrary, and it is the map, not the surface, that knows.
 */
export function allowedRevenueMoves(from: RevenueStatus): readonly RevenueStatus[] {
  return ALLOWED[from] ?? [];
}

const ALLOWED: Record<RevenueStatus, readonly RevenueStatus[]> = {
  planned: ["invoiced", "overdue", "written_off"],
  invoiced: ["settled", "overdue", "written_off"],
  overdue: ["invoiced", "settled", "written_off"],
  settled: [],
  written_off: [],
};

export interface RevenueInstalment {
  sequence: number;
  status: RevenueStatus;
  plannedAmount: Money;
  actualAmount: Money | null;
  dueAt: Date | null;
  settledAt: Date | null;
}

export interface RevenuePatch {
  status: RevenueStatus;
  actualAmount?: Money;
  settledAt?: Date | null;
}

export function planRevenueTransition(
  current: RevenueInstalment,
  to: RevenueStatus,
  opts: { actualAmount?: Money; at?: Date } = {},
): RuleResult<RevenuePatch> {
  if (!(REVENUE_STATUSES as readonly string[]).includes(to)) {
    return fail(violation("unknown_status", `${String(to)} is not a revenue status`, "status"));
  }
  if (!ALLOWED[current.status].includes(to)) {
    return fail(
      violation("illegal_transition", `an instalment cannot go from ${current.status} to ${to}`, "status"),
    );
  }

  if (to === "settled") {
    const actual = opts.actualAmount ?? current.actualAmount;
    if (!actual) {
      // Settling without recording what arrived leaves planned-versus-actual
      // uncomputable, which is the one number this table exists to produce.
      return fail(
        violation("actual_amount_required", "settling requires the amount actually received", "actualAmount"),
      );
    }
    if (!isNonNegative(actual)) {
      return fail(violation("amount_negative", "a settled amount cannot be negative", "actualAmount"));
    }
    if (actual.currency !== current.plannedAmount.currency) {
      return fail(
        violation(
          "currency_mismatch",
          `settled in ${actual.currency} but planned in ${current.plannedAmount.currency}`,
          "currency",
        ),
      );
    }
    return ok({ status: "settled", actualAmount: actual, settledAt: opts.at ?? new Date() });
  }

  // Leaving settled is impossible, so clearing settledAt is only ever about a
  // row that never had one.
  return ok({ status: to, settledAt: null });
}

/** Is this instalment overdue as of `now`? Pure: nothing is written here. */
export function isOverdue(inst: RevenueInstalment, now: Date = new Date()): boolean {
  if (inst.status === "settled" || inst.status === "written_off") return false;
  return inst.dueAt != null && inst.dueAt.getTime() < now.getTime();
}

export interface CollectionSummary {
  planned: Money;
  collected: Money;
  overdueCount: number;
  writtenOffCount: number;
  /** collected / planned, or null when nothing was planned. */
  collectionRate: number | null;
}

export function summarizeCollections(
  instalments: readonly RevenueInstalment[],
  currency: string,
  now: Date = new Date(),
): RuleResult<CollectionSummary> {
  let plannedMinor = 0;
  let collectedMinor = 0;
  let overdueCount = 0;
  let writtenOffCount = 0;

  for (const inst of instalments) {
    if (inst.plannedAmount.currency !== currency) {
      return fail(
        violation("currency_mismatch", `expected ${currency} but found ${inst.plannedAmount.currency}`, "currency"),
      );
    }
    plannedMinor += Math.round(inst.plannedAmount.amount * 100);
    if (inst.status === "settled" && inst.actualAmount) {
      collectedMinor += Math.round(inst.actualAmount.amount * 100);
    }
    if (inst.status === "overdue" || isOverdue(inst, now)) overdueCount += 1;
    if (inst.status === "written_off") writtenOffCount += 1;
  }

  return ok({
    planned: { amount: plannedMinor / 100, currency },
    collected: { amount: collectedMinor / 100, currency },
    overdueCount,
    writtenOffCount,
    collectionRate: plannedMinor === 0 ? null : collectedMinor / plannedMinor,
  });
}

// --- Project health ---------------------------------------------------------

export interface ProjectHealthInput {
  /** What the delivery team reports. */
  reported: ProjectHealth;
  instalments: readonly RevenueInstalment[];
  milestones: readonly { status: MilestoneStatus; dueAt: Date | null }[];
  now?: Date;
}

export interface ProjectHealthResult {
  health: ProjectHealth;
  /** Set when the derived health is worse than what was reported. */
  overriddenBecause: string | null;
}

/**
 * Reconcile reported health against the facts.
 *
 * Only ever downgrades. The delivery team knows things this function does not,
 * so an amber they report stays amber even when every instalment is paid; but a
 * green they report cannot survive an overdue instalment or a missed milestone,
 * because those are the facts a status report is most likely to omit.
 */
export function deriveProjectHealth(input: ProjectHealthInput): RuleResult<ProjectHealthResult> {
  const now = input.now ?? new Date();
  const overdue = input.instalments.filter((i) => i.status === "overdue" || isOverdue(i, now)).length;
  const missed = input.milestones.filter((m) => m.status === "missed").length;

  if (overdue > 0) {
    // The spec's explicit rule: an overdue instalment forbids green.
    if (input.reported === "green") {
      return ok({
        health: "amber",
        overriddenBecause: `${overdue} overdue instalment(s): a project with unpaid instalments cannot be green`,
      });
    }
    return ok({ health: input.reported, overriddenBecause: null });
  }

  if (missed > 0 && input.reported === "green") {
    return ok({
      health: "amber",
      overriddenBecause: `${missed} missed milestone(s)`,
    });
  }

  return ok({ health: input.reported, overriddenBecause: null });
}

/** Milestone progress, for the project view and for the copilot's grounding. */
export function milestoneProgress(
  milestones: readonly { status: MilestoneStatus }[],
): { total: number; done: number; missed: number; ratio: number | null } {
  const total = milestones.length;
  const done = milestones.filter((m) => m.status === "done").length;
  return {
    total,
    done,
    missed: milestones.filter((m) => m.status === "missed").length,
    ratio: total === 0 ? null : done / total,
  };
}

/** `sequence` is part of the row's unique key and is never patched. */
export function assertSequenceUnchanged(patch: Record<string, unknown>): RuleResult<true> {
  if (!Object.prototype.hasOwnProperty.call(patch, "sequence")) return ok(true);
  return fail(
    violation(
      "sequence_immutable",
      "revenue_schedule.sequence is part of the row identity; reordering instalments means writing new rows",
      "sequence",
    ),
  );
}
