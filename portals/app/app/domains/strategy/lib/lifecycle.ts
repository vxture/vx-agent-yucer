// D1 strategy and D3 campaign lifecycles.
//
// These two domains share a file because they share a shape: both own an object
// with a status machine, and both are upstream anchors that downstream records
// point back at. That shared shape carries one rule worth stating once:
//
//   ARCHIVING AN UPSTREAM RECORD NEVER DESTROYS DOWNSTREAM ONES. Every
//   downstream reference is ON DELETE SET NULL, never CASCADE (design_yucer_100
//   section 3). Downstream data is accomplished fact; a tidy-up upstream must
//   not erase it. These functions therefore describe what a status change means,
//   and never cascade anything.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

// --- D1 strategy plan -------------------------------------------------------

export const PLAN_STATUSES = ["draft", "approved", "active", "closed", "archived"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

const PLAN_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  // A draft can be abandoned outright; it was never a commitment.
  draft: ["approved", "archived"],
  // Approved but not yet running - can start, or be sent back for rework.
  approved: ["active", "draft", "archived"],
  // A running plan ends by being closed, not by being deleted.
  active: ["closed"],
  // Closed keeps its history and can be filed away.
  closed: ["archived"],
  archived: [],
};

export interface PlanSnapshot {
  status: PlanStatus;
  approvedAt: Date | null;
}

export interface PlanPatch {
  status: PlanStatus;
  approvedAt?: Date | null;
}

/**
 * The moves that are legal from here.
 *
 * Exported so a surface can offer exactly these. A picker listing every status
 * and letting the machine refuse four of the five teaches people that the
 * product says no for reasons they cannot predict - and the transition map is
 * the only thing that knows the answer, so it is the thing that must be asked.
 */
export function nextPlanStatuses(current: PlanStatus): readonly PlanStatus[] {
  return PLAN_TRANSITIONS[current] ?? [];
}

export function planStrategyTransition(
  current: PlanSnapshot,
  to: PlanStatus,
  opts: { at?: Date } = {},
): RuleResult<PlanPatch> {
  if (!(PLAN_STATUSES as readonly string[]).includes(to)) {
    return fail(violation("unknown_status", `${String(to)} is not a plan status`, "status"));
  }
  if (!PLAN_TRANSITIONS[current.status].includes(to)) {
    return fail(violation("illegal_transition", `a plan cannot go from ${current.status} to ${to}`, "status"));
  }
  // approved_at stamps the moment of approval and is not re-stamped by later
  // moves: it answers "when was this signed off", not "when did it last change".
  if (to === "approved" && current.approvedAt == null) {
    return ok({ status: to, approvedAt: opts.at ?? new Date() });
  }
  return ok({ status: to });
}

/** Only an active plan should attract new downstream work. */
export function planAcceptsNewWork(status: PlanStatus): boolean {
  return status === "active";
}

// --- D3 campaign ------------------------------------------------------------

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["scheduled", "running", "cancelled"],
  scheduled: ["running", "draft", "cancelled"],
  running: ["paused", "completed", "cancelled"],
  paused: ["running", "completed", "cancelled"],
  // Both terminal. A campaign that ran and one that never did are different
  // facts, and attribution already points at whichever it was.
  completed: [],
  cancelled: [],
};

export interface CampaignSnapshot {
  status: CampaignStatus;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** The moves that are legal from here. See nextPlanStatuses. */
export function nextCampaignStatuses(current: CampaignStatus): readonly CampaignStatus[] {
  return CAMPAIGN_TRANSITIONS[current] ?? [];
}

export function planCampaignTransition(
  current: CampaignSnapshot,
  to: CampaignStatus,
): RuleResult<{ status: CampaignStatus }> {
  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(to)) {
    return fail(violation("unknown_status", `${String(to)} is not a campaign status`, "status"));
  }
  if (!CAMPAIGN_TRANSITIONS[current.status].includes(to)) {
    return fail(
      violation("illegal_transition", `a campaign cannot go from ${current.status} to ${to}`, "status"),
    );
  }
  if (to === "scheduled" && !current.startsAt) {
    return fail(violation("start_required", "a scheduled campaign needs a start time", "startsAt"));
  }
  return ok({ status: to });
}

export function validateCampaignWindow(
  startsAt: Date | null,
  endsAt: Date | null,
): RuleResult<true> {
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    return fail(violation("window_inverted", "a campaign cannot end before it starts", "endsAt"));
  }
  return ok(true);
}

export const EXECUTION_STATUSES = ["pending", "in_progress", "done", "skipped"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export interface ExecutionProgress {
  total: number;
  done: number;
  skipped: number;
  outstanding: number;
  /** Completed over attempted (done + skipped is not attempted). */
  completionRatio: number | null;
}

/**
 * Campaign execution progress.
 *
 * `skipped` is counted separately from `done` rather than folded in. A campaign
 * where half the outreach was skipped and a campaign where all of it landed have
 * the same "nothing outstanding" state and completely different meanings.
 */
export function executionProgress(
  executions: readonly { status: ExecutionStatus }[],
): ExecutionProgress {
  const total = executions.length;
  const done = executions.filter((e) => e.status === "done").length;
  const skipped = executions.filter((e) => e.status === "skipped").length;
  return {
    total,
    done,
    skipped,
    outstanding: total - done - skipped,
    completionRatio: total === 0 ? null : done / total,
  };
}

/**
 * A campaign is only finished when nothing is outstanding. Completing one with
 * work still pending marks demand generation as done that never happened.
 */
export function canCompleteCampaign(
  executions: readonly { status: ExecutionStatus }[],
): RuleResult<true> {
  const progress = executionProgress(executions);
  if (progress.outstanding > 0) {
    return fail(
      violation(
        "executions_outstanding",
        `${progress.outstanding} execution(s) still pending; finish or skip them before completing the campaign`,
        "status",
      ),
    );
  }
  return ok(true);
}
