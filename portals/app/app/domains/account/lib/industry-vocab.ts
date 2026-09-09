import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 行业的规则 - incr/0040.
//
// WHY IT IS A VOCABULARY. The industry is not a label on a customer card: it
// decides the market segment, the segment decides the playbook, and every
// group-by in the product reads it. Free text made "制造" and "制造业" two
// industries, and a segment whose criteria named one of them silently stopped
// matching the other - a mismatch nothing reported, because nothing could tell
// a typo from a new industry.
//
// THE SHIPPED LIST IS A STARTING POINT, not a standard. 国民经济行业分类 has
// twenty categories and several hundred classes; a seller segments on a much
// coarser cut, and a list too fine to choose from quickly gets one value
// picked for everything.

/**
 * The shipped thirteen, seeded once per workspace on first contact.
 *
 * incr/0040 seeds the SAME rows into a workspace that already has customers,
 * so the two paths cannot disagree. Order is the order they are offered in.
 */
export const DEFAULT_INDUSTRIES: readonly {
  readonly industryCode: string;
  readonly name: string;
}[] = [
  { industryCode: "manufacturing", name: "制造" },
  { industryCode: "it", name: "信息技术" },
  { industryCode: "telecom", name: "通信" },
  { industryCode: "finance", name: "金融" },
  { industryCode: "retail", name: "零售" },
  { industryCode: "logistics", name: "物流" },
  { industryCode: "healthcare", name: "医药健康" },
  { industryCode: "energy", name: "能源" },
  { industryCode: "construction", name: "建筑地产" },
  { industryCode: "education", name: "教育" },
  { industryCode: "government", name: "政府公共" },
  { industryCode: "services", name: "专业服务" },
  { industryCode: "other", name: "其他" },
];

export interface IndustryDraft {
  industryCode: string;
  name: string;
}

/** An industry needs a code to be anchored by and a name to be read as. */
export function planIndustry(input: IndustryDraft): RuleResult<IndustryDraft> {
  if (!input.industryCode.trim()) {
    return fail(violation("code_required", "an industry needs a code", "industryCode"));
  }
  if (!input.name.trim()) {
    return fail(violation("name_required", "an industry needs a name", "name"));
  }
  return ok({ industryCode: input.industryCode.trim(), name: input.name.trim() });
}

/**
 * May this industry be deleted?
 *
 * Refused while customers are filed under it - fk_account_industry RESTRICTs
 * underneath and this rule is the sentence. Unlike a win/loss reason, this one
 * has a way out that does not lose anything: re-file those customers first,
 * and the row becomes deletable.
 */
export function planIndustryRemoval(accountsFiled: number): RuleResult<true> {
  if (accountsFiled > 0) {
    return fail(
      violation(
        "industry_in_use",
        `${accountsFiled} customer(s) are filed under this industry - it cannot be deleted`,
        "industryCode",
      ),
    );
  }
  return ok(true);
}

/**
 * The vocabulary row a written value means, or null.
 *
 * BY NAME OR BY CODE, because the writers differ: a person picks a name from a
 * list, and the copilot proposes `{ field: "industry", value: "制造" }` as free
 * text a model produced. Both have to land on the same row, and anything that
 * lands on none is refused rather than becoming a fourteenth industry - which
 * is the whole point of the vocabulary.
 */
export function resolveIndustry<T extends { id: string; industryCode: string; name: string }>(
  rows: readonly T[],
  value: string,
): T | null {
  const want = value.trim();
  if (!want) return null;
  return (
    rows.find((r) => r.name === want) ??
    rows.find((r) => r.industryCode === want) ??
    rows.find((r) => r.name.toLowerCase() === want.toLowerCase()) ??
    rows.find((r) => r.industryCode.toLowerCase() === want.toLowerCase()) ??
    null
  );
}
