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

/**
 * Mirrors chk_campaign_execution_action. `ExecutionRecord.actionType` was a
 * bare `string` while the database held a CHECK - so a surface could offer a
 * type Postgres refuses, and only the write would find out.
 */
export const EXECUTION_ACTION_TYPES = ["outreach", "content", "event", "nurture", "handoff"] as const;
export type ExecutionActionType = (typeof EXECUTION_ACTION_TYPES)[number];

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

// --- Bringing a plan into existence (TD-016) ---------------------------------

export interface NewPlanDraft {
  /** Unique per workspace and NOT writable - the anchor, like a territory code. */
  planNo: string;
  name: string;
  period: string;
  objective: string | null;
  ownerSub: string | null;
}

/**
 * Validate a plan before it is written.
 *
 * `strategy.plan.create` shipped in batch 1 with nothing behind it (TD-016).
 * The port has `listPlans`, `getPlan` and `updatePlan`, and `/strategy` renders
 * the list and moves plans through their lifecycle - so a plan could be
 * approved, activated, closed and archived, and could not be created.
 *
 * A NEW PLAN IS ALWAYS A DRAFT, and the status is not an argument. `planPlanTransition`
 * above owns every move after this one, including the approval that stamps
 * `approved_at`; letting a caller start a plan at `approved` would be a way to
 * reach that state without the transition that records it. The same reason a
 * target starts as a draft and a deal starts at qualify.
 */
export function planNewPlan(input: NewPlanDraft): RuleResult<NewPlanDraft & { status: "draft" }> {
  const planNo = input.planNo.trim();
  const name = input.name.trim();
  const period = input.period.trim();

  if (!planNo) {
    return fail(violation("plan_no_required", "a plan needs a number", "planNo"));
  }
  if (!name) {
    return fail(violation("name_required", "a plan needs a name", "name"));
  }
  if (!period) {
    // Every downstream reader joins on it: targets carry a period, campaigns
    // hang off a plan, and "which half-year is this" is not derivable from
    // anything else on the row.
    return fail(violation("period_required", "a plan needs a period", "period"));
  }

  return ok({
    ...input,
    planNo,
    name,
    period,
    objective: input.objective?.trim() || null,
    status: "draft",
  });
}

// --- Writing an execution (TD-016) -------------------------------------------

export interface ExecutionDraft {
  /** Absent creates; present edits that row. Executions have no business key. */
  id?: string | null;
  title: string;
  actionType: ExecutionActionType;
  assigneeSub: string | null;
  dueAt: Date | null;
  status: ExecutionStatus;
}

/**
 * Validate one campaign execution before it is written.
 *
 * `campaign.execution.upsert` shipped in batch 1 with nothing behind it
 * (TD-016), and this one was not merely unfinished - it was LOCKING something.
 * `canCompleteCampaign` above refuses to complete a campaign while any
 * execution is outstanding, and nothing in the product could move an execution
 * to done or skipped. A campaign with one pending item could therefore never be
 * completed, by anyone, ever. Proven on the demo data before this was written:
 * camp_demo_1 (done/done/pending) was refused with `executions_outstanding`
 * while camp_demo_3 (done) completed.
 *
 * A COMPLETED CAMPAIGN'S EXECUTIONS ARE FROZEN. The campaign was completed on
 * the basis that nothing was outstanding; reopening an item afterwards would
 * make that completion retroactively untrue, and `canCompleteCampaign` would
 * never be consulted again to notice. The same reason a closed deal's lines are
 * the record of what was sold.
 */
export function planExecution(
  input: ExecutionDraft,
  campaign: { status: CampaignStatus },
): RuleResult<ExecutionDraft> {
  if (campaign.status === "completed") {
    return fail(
      violation(
        "campaign_completed",
        "this campaign is complete; its executions are the record it was completed on",
        "status",
      ),
    );
  }

  const title = input.title.trim();
  if (!title) {
    return fail(violation("title_required", "an execution needs a title", "title"));
  }
  if (!(EXECUTION_ACTION_TYPES as readonly string[]).includes(input.actionType)) {
    return fail(
      violation("unknown_action_type", `${String(input.actionType)} is not an action type`, "actionType"),
    );
  }
  if (!(EXECUTION_STATUSES as readonly string[]).includes(input.status)) {
    return fail(violation("unknown_status", `${String(input.status)} is not an execution status`, "status"));
  }

  return ok({ ...input, title });
}

// --- D1 market segments ----------------------------------------------------
//
// A segment is the addressable-market decomposition of a strategy: who we are
// going after, cut into named pieces, ordered by priority.
//
// It is the anchor two other records already point at. `campaign.segment_id` is
// a real foreign key; `account.segment_code` points at it BY VALUE, with no
// foreign key to enforce it. That second one is why the code is immutable here:
// nothing in the database would stop a rename, and nothing would tell you that
// seven accounts had just stopped resolving.

export const SEGMENT_STATUSES = ["active", "paused", "retired"] as const;
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];

/**
 * The industry/size/region filters the DDL always promised. Only the two
 * dimensions accounts actually carry are modelled - industry and region - so
 * a criterion is checkable against real rows rather than aspirational.
 */
export interface SegmentCriteria {
  industries: readonly string[];
  regions: readonly string[];
}

export interface SegmentDraft {
  segmentCode: string;
  name: string;
  planId: string | null;
  priority: number;
  status: SegmentStatus;
  criteria: SegmentCriteria;
}

/** An account matches when every non-empty dimension names its value. */
export function accountMatchesCriteria(
  account: { industry: string | null; region: string | null },
  criteria: SegmentCriteria,
): boolean {
  if (criteria.industries.length === 0 && criteria.regions.length === 0) return false;
  const industryOk =
    criteria.industries.length === 0 ||
    (account.industry !== null && criteria.industries.includes(account.industry));
  const regionOk =
    criteria.regions.length === 0 ||
    (account.region !== null && criteria.regions.includes(account.region));
  return industryOk && regionOk;
}

export function planSegment(
  input: SegmentDraft,
  plan: { status: PlanStatus } | null,
): RuleResult<SegmentDraft> {
  // A closed or archived plan's segmentation is the record of how the market
  // was cut for that period, and campaigns were aimed using it. Re-cutting it
  // afterwards rewrites the reasoning those campaigns were built on, and
  // nothing would ever be asked to notice. Same rule as a completed campaign's
  // executions.
  if (plan && (plan.status === "closed" || plan.status === "archived")) {
    return fail(
      violation(
        "plan_closed",
        "this plan is closed; its segmentation is how the market was cut for that period",
        "planId",
      ),
    );
  }

  const segmentCode = input.segmentCode.trim();
  const name = input.name.trim();
  // Trimmed and de-duplicated, not merely accepted: " 零售" would never match
  // an account whose industry is "零售", and nothing downstream would say why.
  const criteria: SegmentCriteria = {
    industries: [...new Set(input.criteria.industries.map((v) => v.trim()).filter(Boolean))],
    regions: [...new Set(input.criteria.regions.map((v) => v.trim()).filter(Boolean))],
  };

  if (!segmentCode) {
    return fail(violation("segment_code_required", "a segment needs a code", "segmentCode"));
  }
  if (!name) {
    return fail(violation("name_required", "a segment needs a name", "name"));
  }
  if (!(SEGMENT_STATUSES as readonly string[]).includes(input.status)) {
    return fail(
      violation("unknown_status", `${String(input.status)} is not a segment status`, "status"),
    );
  }
  // Priority orders the list a reader works down. A negative or fractional one
  // sorts somewhere nobody predicted, and SMALLINT would reject the large end
  // at write time rather than here.
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 9999) {
    return fail(
      violation("priority_out_of_range", "priority is a whole number from 0 to 9999", "priority"),
    );
  }

  return ok({ ...input, segmentCode, name, criteria });
}
