import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 业务形态的规则 - incr/0067.
//
// THE OTHER AXIS of incr/0060's deal_type: what form the business takes.
// 项目定制类 is built for one customer, 标化产品类 is sold as it is, 咨询服务类
// sells people's time rather than either - and a deal of any of the three can
// equally be a 新签, a 续签 or an 增购, which is exactly why the two lists are
// two lists.
//
// 咨询服务类 IS NEW in this split. The old five had no place for it: it is
// neither the "项目型" of a bespoke build nor the "产品型" of a catalogue sale,
// and workspaces that sell advisory work had to file it under whichever of the
// two lied least.
//
// 停滞天数覆盖 LIVES HERE, not on the contract-type axis (incr/0062 put it on
// the conflated table). How long a deal may sit at one stage before the clock
// caps its forecast band is a fact about delivery complexity - a bespoke
// project negotiates longer than a standard product sale - and says nothing
// about whether that deal is new business or a renewal.

export const DEFAULT_BUSINESS_FORMS: readonly {
  readonly businessFormCode: string;
  readonly name: string;
}[] = [
  { businessFormCode: "custom_project", name: "项目定制类" },
  { businessFormCode: "standard_product", name: "标化产品类" },
  { businessFormCode: "consulting", name: "咨询服务类" },
];

export interface BusinessFormDraft {
  businessFormCode: string;
  name: string;
}

export function planBusinessForm(input: BusinessFormDraft): RuleResult<BusinessFormDraft> {
  if (!input.businessFormCode.trim()) {
    return fail(violation("code_required", "a business form needs a code", "businessFormCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "a business form needs a name", "name"));
  }
  return ok({ businessFormCode: input.businessFormCode.trim(), name: input.name.trim() });
}

export function planBusinessFormStallOverride(input: number | null): RuleResult<number | null> {
  if (input === null) return ok(null);
  if (!Number.isInteger(input) || input < 1 || input > 365) {
    return fail(
      violation(
        "stall_override_out_of_range",
        "a stall override must be between 1 and 365 days",
        "stallDaysOverride",
      ),
    );
  }
  return ok(input);
}

export function planBusinessFormRemoval(opportunitiesFiled: number): RuleResult<true> {
  if (opportunitiesFiled > 0) {
    return fail(
      violation(
        "business_form_in_use",
        `${opportunitiesFiled} opportunity(ies) are filed under this business form - it cannot be deleted`,
        "businessFormCode",
      ),
    );
  }
  return ok(true);
}
