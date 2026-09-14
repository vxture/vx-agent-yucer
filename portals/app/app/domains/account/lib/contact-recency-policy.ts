// How many days of silence count as quiet, stale, or cold - a workspace's own
// call, since incr/0065.
//
// THREE NUMBERS, ONE ROW, FOR THE SAME REASON incr/0041 GAVE
// forecast_threshold THREE COLUMNS: they are three different judgements built
// on the same underlying fact (days since last contact), and a workspace that
// tunes one of them is the same workspace deciding all three in one sitting.
//
// quietDays/staleDays drive judgement.ts's home-feed cards (a lighter "gone
// quiet" card, and a heavier "stalled and a promise was broken" card that
// reuses staleDays again to escalate the quiet card's own urgency).
// chainWarmDays is unrelated to either card - it drives health.ts's
// warm/cold classification of a decision-chain contact - but it is the same
// SHAPE of number (a recency cutoff nobody but the workspace should be
// picking), so it rides in the same row rather than opening a second table.
//
// staleDays MUST exceed quietDays: judgement.ts escalates the quiet card from
// "watch" to "week" once the silence passes staleDays, so a workspace that set
// them the other way around would get a lighter card for a longer silence.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export interface ContactRecencyPolicy {
  /** Silent longer than this, with no broken promise either way: a quiet card. */
  readonly quietDays: number;
  /** Silent longer than this: the quiet card escalates, and a stalled-plus-broken-promise card fires on its own. */
  readonly staleDays: number;
  /** A decision-chain contact goes cold once nobody has reached them inside this many days. */
  readonly chainWarmDays: number;
}

/**
 * What a workspace gets before anybody changes it - the same numbers incr/0065
 * writes as the column defaults, so a fresh row and a seeded one agree.
 */
export const DEFAULT_CONTACT_RECENCY_POLICY: ContactRecencyPolicy = {
  quietDays: 21,
  staleDays: 30,
  chainWarmDays: 90,
};

export function planContactRecencyPolicy(
  input: ContactRecencyPolicy,
): RuleResult<ContactRecencyPolicy> {
  const whole = (n: number) => Number.isInteger(n);
  if (!whole(input.quietDays) || input.quietDays < 1 || input.quietDays > 365) {
    return fail(violation("quiet_out_of_range", "a quiet window runs from 1 to 365 days", "quietDays"));
  }
  if (!whole(input.staleDays) || input.staleDays < 1 || input.staleDays > 365) {
    return fail(violation("stale_out_of_range", "a stale window runs from 1 to 365 days", "staleDays"));
  }
  if (input.quietDays >= input.staleDays) {
    return fail(violation(
      "recency_bands_cross",
      "stale has to sit above quiet, or the quiet card would escalate before it exists",
      "staleDays",
    ));
  }
  if (!whole(input.chainWarmDays) || input.chainWarmDays < 1 || input.chainWarmDays > 365) {
    return fail(violation("chain_warm_out_of_range", "a chain-warmth window runs from 1 to 365 days", "chainWarmDays"));
  }
  return ok(input);
}
