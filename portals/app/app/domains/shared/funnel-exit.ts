import { fail, ok, violation, type RuleResult } from "./result";

// Why anything left the funnel (incr/0033, design_yucer_110 batch B).
//
// SHARED, not owned by one domain, and that is deliberate. The five stages
// live in two schemas and three capability partitions; the whole value of one
// exit table is the cross-stage question, so the rule that validates a row
// cannot sit inside any single domain without the other four importing across
// a boundary to reach it.
//
// THIS FILE DECIDES SHAPE, NOT POLICY. Whether a particular lead may be ended
// is the lead's own rule (planLeadAdvance); whether the row describing that
// ending is well-formed is here.

export const FUNNEL_STAGES = ["signal", "lead", "opportunity", "project", "revenue"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/**
 * Mirrors chk_funnel_exit_outcome. An ARRAY per stage with the type derived
 * from it, like MILESTONE_STATUSES and REVENUE_STATUSES: a hand-written union
 * beside a hand-written CHECK is two lists that drift, and the surface
 * offering an outcome the database refuses is how that drift is found.
 */
export const STAGE_OUTCOMES: Record<FunnelStage, readonly string[]> = {
  signal: ["dismissed", "duplicate"],
  // ONE TERMINAL STATE, because that is all `lead.status` has. 判定不合格 and
  // 终结 are two business moments that both end here; the REASON is what
  // separates them, not a second status.
  lead: ["disqualified"],
  opportunity: ["lost", "abandoned"],
  project: ["cancelled"],
  revenue: ["written_off"],
};

/** Mirrors chk_funnel_exit_reason. */
export const EXIT_REASONS = [
  "duplicate",
  "not_a_fit",
  "no_budget",
  "no_decision",
  "lost_to_competitor",
  "timing",
  "customer_withdrew",
  "unreachable",
  "other",
] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];

/**
 * The reasons that make sense for each of a lead's two endings.
 *
 * TWO MENUS OVER ONE VOCABULARY, not two vocabularies. 判定不合格 says the
 * demand was never ours to win - wrong fit, a duplicate, nobody reachable.
 * 终结 says it was real and it died - no budget, no decision, somebody else
 * won it, not this year, they cancelled the project.
 *
 * OFFERING ALL NINE ON BOTH would make the two actions identical in
 * everything but their label, which is how a vocabulary collapses into
 * whichever option is first in the list.
 */
export const LEAD_DISQUALIFY_REASONS: readonly ExitReason[] = [
  "not_a_fit",
  "duplicate",
  "unreachable",
  "other",
];

/**
 * Why a signal gets ignored.
 *
 * SHORTER THAN A LEAD'S, because less is known. Nobody has spoken to anybody
 * yet - a signal is a report - so "no budget" or "lost to a competitor" are
 * conclusions the reader cannot have reached. What they CAN say is that it is
 * not our kind of work, that it repeats something already here, that the
 * company cannot be reached, or that it is real but not now.
 */
export const SIGNAL_DISMISS_REASONS: readonly ExitReason[] = [
  "not_a_fit",
  "duplicate",
  "timing",
  "unreachable",
  "other",
];

export const LEAD_TERMINATE_REASONS: readonly ExitReason[] = [
  "no_budget",
  "no_decision",
  "lost_to_competitor",
  "timing",
  "customer_withdrew",
  "other",
];

export interface FunnelExitDraft {
  readonly stage: FunnelStage;
  readonly subjectId: string;
  readonly outcome: string;
  readonly reasonCode: string;
  readonly note: string | null;
  readonly decidedBySub: string;
}

/**
 * Validate an exit record before it is written.
 *
 * Every check here has a CHECK constraint behind it. That is not duplication
 * for its own sake: the database's refusal arrives at the driver as a
 * constraint name, a long way from the person who picked the reason, and this
 * layer turns the same rule into a violation the surface can render.
 */
export function planFunnelExit(input: FunnelExitDraft): RuleResult<FunnelExitDraft> {
  const note = input.note?.trim() ? input.note.trim() : null;

  if (!(FUNNEL_STAGES as readonly string[]).includes(input.stage)) {
    return fail(violation("unknown_stage", `${String(input.stage)} is not a funnel stage`, "stage"));
  }
  if (!STAGE_OUTCOMES[input.stage].includes(input.outcome)) {
    // A lead that claims it was written_off would be counted under a stage it
    // never belonged to - which is the one thing a cross-stage table must not
    // allow.
    return fail(
      violation(
        "outcome_not_of_stage",
        `${input.outcome} is not how a ${input.stage} ends`,
        "outcome",
      ),
    );
  }
  if (!(EXIT_REASONS as readonly string[]).includes(input.reasonCode)) {
    return fail(violation("unknown_reason", `${input.reasonCode} is not an exit reason`, "reasonCode"));
  }
  if (input.reasonCode === "other" && !note) {
    // A catch-all with no sentence behind it becomes the whole vocabulary
    // within a quarter: everybody picks the option that never argues back.
    return fail(
      violation("note_required", "'other' has to say what happened", "note"),
    );
  }
  if (!input.decidedBySub.trim()) {
    return fail(violation("decider_required", "an exit record names who decided", "decidedBySub"));
  }

  return ok({ ...input, note });
}
