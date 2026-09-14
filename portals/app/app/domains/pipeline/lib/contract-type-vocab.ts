import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 签约类型的规则 - incr/0067.
//
// ONE OF THE TWO AXES incr/0060's deal_type conflated: what kind of
// transaction this deal is. 新签 opens an account, 续签 keeps one, 增购 grows
// one - three answers to one question, which is what makes them a list. What
// is being sold is the OTHER question, and lives in business-form-vocab.ts.
//
// The codes survive the split unchanged (new_logo/renewal/expansion) because
// they were already the commercial-motion half of the old five, and an anchor
// that changes spelling for cosmetic reasons breaks every row pointing at it.
//
// NOT THE SAME THING AS THE REPORTED 新客户数, and the distinction is worth
// keeping straight: this is what a rep says a deal IS while it is still open;
// `countNewLogos` (pipeline/lib/forecast.ts) counts which accounts were won
// for the first time in a period, after the fact, from the record. The tag is
// intent, the count is outcome, and the reporting path deliberately reads only
// the second. `suggestContractType` (lib/opportunity.ts) keeps the two from
// drifting at the moment a deal is created.

export const DEFAULT_CONTRACT_TYPES: readonly {
  readonly contractTypeCode: string;
  readonly name: string;
}[] = [
  { contractTypeCode: "new_logo", name: "新签" },
  { contractTypeCode: "renewal", name: "续签" },
  { contractTypeCode: "expansion", name: "增购" },
];

export interface ContractTypeDraft {
  contractTypeCode: string;
  name: string;
}

export function planContractType(input: ContractTypeDraft): RuleResult<ContractTypeDraft> {
  if (!input.contractTypeCode.trim()) {
    return fail(violation("code_required", "a contract type needs a code", "contractTypeCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a contract type needs a name", "name"));
  }
  return ok({ contractTypeCode: input.contractTypeCode.trim(), name: input.name.trim() });
}

export function planContractTypeRemoval(opportunitiesFiled: number): RuleResult<true> {
  if (opportunitiesFiled > 0) {
    return fail(
      violation(
        "contract_type_in_use",
        `${opportunitiesFiled} opportunity(ies) are filed under this contract type - it cannot be deleted`,
        "contractTypeCode",
      ),
    );
  }
  return ok(true);
}
