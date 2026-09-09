import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 赢丢原因的规则 - incr/0039.
//
// WHY IT IS A VOCABULARY AND `outcome` IS NOT. won/lost is a state the rule
// layer branches on: planWinLossReview refuses a competitor on a win it cannot
// explain, and the funnel counts the two differently. WHY a deal went that way
// is content - "被集成商截胡" is a real reason for a particular company and is
// in nobody's shipped list - so it is rows, and this file holds only the rules
// that keep those rows usable.

/**
 * The shipped six, seeded once per workspace on first contact (incr/0039 seeds
 * the same set into a workspace that already has reviews).
 *
 * 客户未决 IS LOSS-ONLY, and it is the one asymmetry worth having: a deal that
 * was won because the customer did not decide is a sentence with no meaning,
 * and offering it on a win invites a review that says nothing.
 */
export const DEFAULT_WIN_LOSS_REASONS: readonly {
  readonly reasonCode: string;
  readonly name: string;
  readonly forWon: boolean;
  readonly forLost: boolean;
}[] = [
  { reasonCode: "price", name: "价格", forWon: true, forLost: true },
  { reasonCode: "fit", name: "方案匹配", forWon: true, forLost: true },
  { reasonCode: "timing", name: "时机", forWon: true, forLost: true },
  { reasonCode: "competitor", name: "竞争对手", forWon: true, forLost: true },
  { reasonCode: "no_decision", name: "客户未决", forWon: false, forLost: true },
  { reasonCode: "other", name: "其他", forWon: true, forLost: true },
];

export interface WinLossReasonDraft {
  reasonCode: string;
  name: string;
  forWon: boolean;
  forLost: boolean;
}

/**
 * A reason needs a code, a name, and at least one outcome it explains.
 *
 * The third is not a formality: a row that serves neither outcome can never be
 * chosen, so it is invisible everywhere except this configuration page, where
 * it looks like a working entry.
 */
export function planWinLossReason(input: WinLossReasonDraft): RuleResult<WinLossReasonDraft> {
  if (!input.reasonCode.trim()) {
    return fail(violation("code_required", "a reason needs a code", "reasonCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a reason needs a name", "name"));
  }
  if (!input.forWon && !input.forLost) {
    return fail(
      violation("outcome_required", "a reason must explain a win, a loss, or both", "forWon"),
    );
  }
  return ok({
    ...input,
    reasonCode: input.reasonCode.trim(),
    name: input.name.trim(),
  });
}

/**
 * May this reason be deleted?
 *
 * Refused while reviews cite it - fk_win_loss_review_reason RESTRICTs
 * underneath and this rule is the sentence. A review's reason is EVIDENCE:
 * deleting the row it points at would rewrite what somebody concluded about a
 * deal that is already closed.
 */
export function planReasonRemoval(reviewsCiting: number): RuleResult<true> {
  if (reviewsCiting > 0) {
    return fail(
      violation(
        "reason_in_use",
        `${reviewsCiting} review(s) cite this reason - it cannot be deleted`,
        "reasonCode",
      ),
    );
  }
  return ok(true);
}
