import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 计价单位's rules - and nothing else's. The catalogue's third vocabulary, and
// independent of the other two in exactly the way they are independent of each
// other (owner ruling 2026-09-05, extended to the unit on 2026-09-08): this
// file imports nothing from type-vocab.ts or status-vocab.ts, and neither of
// them imports from here.
//
// WHY IT IS A VOCABULARY AT ALL. `unit` was free text on the product form, and
// a line quotes qty x unit price - so the field MULTIPLIES money. Two people
// typing 套 and 台 for the same thing produce two units nobody can group by,
// and a quote reading "12 × ¥8,000" means nothing until you know what one of
// them is.

/** The shipped starter set (incr/0037 seeds the same rows). The first five are
 *  what a B2B catalogue actually quotes in; the rest are here so a delivered
 *  tenant has a usable list rather than an empty one. Industry-neutral on
 *  purpose - the industry fit is the tenant's edit, not our guess. */
export const DEFAULT_UNIT_VOCABULARY: readonly {
  readonly unitCode: string;
  readonly name: string;
}[] = [
  { unitCode: "set", name: "套" },
  { unitCode: "piece", name: "台" },
  { unitCode: "seat", name: "用户" },
  { unitCode: "license", name: "许可" },
  { unitCode: "year", name: "年" },
  { unitCode: "month", name: "月" },
  { unitCode: "day", name: "人天" },
  { unitCode: "hour", name: "人时" },
  { unitCode: "project", name: "项目" },
  { unitCode: "package", name: "包" },
];

export interface ProductUnitDraft {
  unitCode: string;
  name: string;
}

/**
 * A unit needs a code and a name.
 *
 * The code is the workspace's anchor - upserts and imports match on it, and
 * products associate by uuid, so it never joins. It displays nowhere except
 * this configuration page: a quote shows 套, not `set`.
 */
export function planProductUnit(input: ProductUnitDraft): RuleResult<ProductUnitDraft> {
  if (!input.unitCode.trim()) {
    return fail(violation("code_required", "a unit needs a code", "unitCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a unit needs a name", "name"));
  }
  return ok({
    unitCode: input.unitCode.trim(),
    name: input.name.trim(),
  });
}

/**
 * May this UNIT be deleted?
 *
 * Refused while products are priced in it - fk_product_unit RESTRICTs
 * underneath and this rule is the sentence. NO RETIREMENT HERE, unlike the
 * type: a retired type still describes the products that carry it, while a
 * unit that stopped being offered is either still what those products are
 * priced in, or they need repricing - and neither is a state the vocabulary
 * can hold. Move the products first.
 */
export function planUnitRemoval(productsPricedIn: number): RuleResult<true> {
  if (productsPricedIn > 0) {
    return fail(
      violation(
        "unit_in_use",
        `${productsPricedIn} product(s) are priced in this unit - move them first`,
        "unitCode",
      ),
    );
  }
  return ok(true);
}
