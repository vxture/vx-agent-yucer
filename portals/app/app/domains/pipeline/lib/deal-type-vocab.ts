import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 商机类型的规则 - incr/0060.
//
// WHY IT IS A VOCABULARY, AND A NEW ONE - `opportunity` never carried a
// type/kind/category column before this increment (docs/70-workplan/00-index.md's
// "候选二: 商机类型分轴", recorded well before this increment actually built
// it). A workspace's classification axis, not a fixed enum: the shipped five
// mix commercial motion (新签/续费/增购) and delivery form (项目型/产品型) on
// purpose - the same one-flat-list simplification every vocabulary here makes.
//
// NULLABLE ON PURPOSE, unlike stage. Every deal that predates this column has
// no type, and that is the honest answer rather than something to default.

/**
 * The shipped five, seeded once per workspace on first contact.
 *
 * incr/0060 seeds the SAME rows into a workspace that already has an
 * opportunity, so the two paths cannot disagree. Order is the order they are
 * offered in.
 */
export const DEFAULT_DEAL_TYPES: readonly {
  readonly dealTypeCode: string;
  readonly name: string;
}[] = [
  { dealTypeCode: "new_logo", name: "新签" },
  { dealTypeCode: "renewal", name: "续费" },
  { dealTypeCode: "expansion", name: "增购" },
  { dealTypeCode: "project", name: "项目型" },
  { dealTypeCode: "product", name: "产品型" },
];

export interface DealTypeDraft {
  dealTypeCode: string;
  name: string;
}

/** A deal type needs a code to be anchored by and a name to be read as. */
export function planDealType(input: DealTypeDraft): RuleResult<DealTypeDraft> {
  if (!input.dealTypeCode.trim()) {
    return fail(violation("code_required", "a deal type needs a code", "dealTypeCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a deal type needs a name", "name"));
  }
  return ok({ dealTypeCode: input.dealTypeCode.trim(), name: input.name.trim() });
}

/**
 * May this deal type be deleted?
 *
 * Refused while opportunities are filed under it - fk_opportunity_deal_type
 * RESTRICTs underneath and this rule is the sentence. Same shape as
 * planIndustryRemoval: re-file those deals first and the row becomes
 * deletable, nothing is lost.
 */
/**
 * A stall-days override for one deal type (候选二's second layer, incr/0062).
 *
 * `null` clears the override back to "use this workspace's own
 * forecast_threshold.stall_days" and is always ok. A set value shares
 * forecast_threshold.stall_days's own bound (chk_forecast_threshold_stall):
 * a zero-day override would cap a deal the day it moved, and a decade-long
 * one would never fire - both are ways of turning the clock off, not values
 * this field is for.
 */
export function planDealTypeStallOverride(input: number | null): RuleResult<number | null> {
  if (input === null) return ok(null);
  if (!Number.isInteger(input) || input < 1 || input > 365) {
    return fail(violation("stall_override_out_of_range", "a stall override must be between 1 and 365 days", "stallDaysOverride"));
  }
  return ok(input);
}

export function planDealTypeRemoval(opportunitiesFiled: number): RuleResult<true> {
  if (opportunitiesFiled > 0) {
    return fail(
      violation(
        "deal_type_in_use",
        `${opportunitiesFiled} opportunity(ies) are filed under this type - it cannot be deleted`,
        "dealTypeCode",
      ),
    );
  }
  return ok(true);
}
