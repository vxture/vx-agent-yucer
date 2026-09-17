import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 客户规模 - incr/0071, 客户分类's third vocabulary.
//
// NOT account.employeeCount. That is a raw headcount the customer reports;
// this is the BAND the workspace itself sells against - 集团客户 gets a
// different playbook and a different approver than 微型企业, and neither is
// a fact the count alone decides (the boundary is a commercial call). The two
// columns stay independent, same reasoning as incr/0024's own comment on
// employeeCount being a count rather than a name.

/** The shipped five - 国标 large/medium/small/micro plus 集团 above it. */
export const DEFAULT_CUSTOMER_SIZES: readonly {
  readonly customerSizeCode: string;
  readonly name: string;
}[] = [
  { customerSizeCode: "group", name: "集团客户" },
  { customerSizeCode: "large", name: "大型企业" },
  { customerSizeCode: "medium", name: "中型企业" },
  { customerSizeCode: "small", name: "小型企业" },
  { customerSizeCode: "micro", name: "微型企业" },
];

export interface CustomerSizeDraft {
  customerSizeCode: string;
  name: string;
}

export function planCustomerSize(input: CustomerSizeDraft): RuleResult<CustomerSizeDraft> {
  if (!input.customerSizeCode.trim()) {
    return fail(violation("code_required", "a customer size needs a code", "customerSizeCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a customer size needs a name", "name"));
  }
  return ok({ customerSizeCode: input.customerSizeCode.trim(), name: input.name.trim() });
}

/** Refused while customers are filed under it - fk_account_customer_size
 *  RESTRICTs underneath and this rule is the sentence. */
export function planCustomerSizeRemoval(accountsFiled: number): RuleResult<true> {
  if (accountsFiled > 0) {
    return fail(
      violation(
        "customer_size_in_use",
        `${accountsFiled} customer(s) are filed under this size - it cannot be deleted`,
        "customerSizeCode",
      ),
    );
  }
  return ok(true);
}
