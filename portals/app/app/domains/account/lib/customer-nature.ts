import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 客户性质 - incr/0072, 客户分类's fourth vocabulary.
//
// WHAT KIND OF ORGANISATION THIS IS - government / SOE / private / foreign -
// distinct from customerType (HOW we sell to it: direct/channel/agent) and
// industry (WHAT it does). None of the three is derivable from either of the
// others, and each drives a different part of a sale: a government account's
// procurement process, budget cycle and required qualifications are nothing
// like a private company's, regardless of industry or sales channel.

/** The shipped eight - the owner's own list plus 合资企业 (neither purely
 *  domestic nor purely foreign - a real third state) and 其他, the same
 *  catch-all every vocabulary here ends with. */
export const DEFAULT_CUSTOMER_NATURES: readonly {
  readonly customerNatureCode: string;
  readonly name: string;
}[] = [
  { customerNatureCode: "government", name: "政府机构" },
  { customerNatureCode: "institution", name: "事业单位" },
  { customerNatureCode: "central_soe", name: "央企" },
  { customerNatureCode: "local_soe", name: "国企" },
  { customerNatureCode: "private", name: "民营企业" },
  { customerNatureCode: "foreign", name: "外资企业" },
  { customerNatureCode: "joint_venture", name: "合资企业" },
  { customerNatureCode: "other", name: "其他" },
];

export interface CustomerNatureDraft {
  customerNatureCode: string;
  name: string;
}

export function planCustomerNature(input: CustomerNatureDraft): RuleResult<CustomerNatureDraft> {
  if (!input.customerNatureCode.trim()) {
    return fail(violation("code_required", "a customer nature needs a code", "customerNatureCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a customer nature needs a name", "name"));
  }
  return ok({ customerNatureCode: input.customerNatureCode.trim(), name: input.name.trim() });
}

/** Refused while customers are filed under it - fk_account_customer_nature
 *  RESTRICTs underneath and this rule is the sentence. */
export function planCustomerNatureRemoval(accountsFiled: number): RuleResult<true> {
  if (accountsFiled > 0) {
    return fail(
      violation(
        "customer_nature_in_use",
        `${accountsFiled} customer(s) are filed under this nature - it cannot be deleted`,
        "customerNatureCode",
      ),
    );
  }
  return ok(true);
}
