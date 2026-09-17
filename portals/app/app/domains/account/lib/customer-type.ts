import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 客户类型 - incr/0071, 客户分类's second vocabulary.
//
// WHO OWNS THE RELATIONSHIP AND HOW A DEAL IS PRICED is what this tells apart
// - a channel-sold account and a directly-sold one are not interchangeable
// rows in a pipeline report, and nothing said so before this existed.

/** The shipped five, seeded once per workspace on first contact. */
export const DEFAULT_CUSTOMER_TYPES: readonly {
  readonly customerTypeCode: string;
  readonly name: string;
}[] = [
  { customerTypeCode: "direct", name: "直销客户" },
  { customerTypeCode: "channel", name: "渠道客户" },
  { customerTypeCode: "agent", name: "代理商" },
  { customerTypeCode: "partner", name: "合作伙伴" },
  { customerTypeCode: "internal", name: "内部客户" },
];

export interface CustomerTypeDraft {
  customerTypeCode: string;
  name: string;
}

export function planCustomerType(input: CustomerTypeDraft): RuleResult<CustomerTypeDraft> {
  if (!input.customerTypeCode.trim()) {
    return fail(violation("code_required", "a customer type needs a code", "customerTypeCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a customer type needs a name", "name"));
  }
  return ok({ customerTypeCode: input.customerTypeCode.trim(), name: input.name.trim() });
}

/** Refused while customers are filed under it - fk_account_customer_type
 *  RESTRICTs underneath and this rule is the sentence. */
export function planCustomerTypeRemoval(accountsFiled: number): RuleResult<true> {
  if (accountsFiled > 0) {
    return fail(
      violation(
        "customer_type_in_use",
        `${accountsFiled} customer(s) are filed under this type - it cannot be deleted`,
        "customerTypeCode",
      ),
    );
  }
  return ok(true);
}
