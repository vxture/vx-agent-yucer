import type { PlanContent } from "./plan-model";
import { amount, minor } from "./plan-values";
export type PlanningFinding = {
  kind:
    | "missing_target"
    | "customer_gap"
    | "team_gap"
    | "over_capacity"
    | "concentration";
  regionId: string | null;
  subject: string;
  value: string | null;
  currency: string | null;
  evidenceKeys: string[];
};
export function planningFindings(content: PlanContent): PlanningFinding[] {
  const out: PlanningFinding[] = [];
  for (const r of content.regions.filter((r) => r.included)) {
    const target = content.targets.find(
      (t) =>
        t.scope === `territory:${r.id}` &&
        t.period === `Y${content.year}` &&
        t.metric === "revenue",
    );
    if (!target?.target)
      out.push({
        kind: "missing_target",
        regionId: r.id,
        subject: r.name,
        value: null,
        currency: target?.currency ?? null,
        evidenceKeys: target ? [target.key] : [],
      });
    const contributions = content.contributions.filter(
      (c) => c.regionId === r.id && c.targetKey === target?.key,
    );
    if (target?.target) {
      const total = contributions.reduce((n, x) => n + minor(x.amount), 0n);
      if (total < minor(target.target))
        out.push({
          kind: "customer_gap",
          regionId: r.id,
          subject: r.name,
          value: amount(minor(target.target) - total),
          currency: target.currency,
          evidenceKeys: [target.key, ...contributions.map((x) => x.key)],
        });
      for (const contribution of contributions)
        if (
          minor(target.target) > 0n &&
          minor(contribution.amount) * 2n > minor(target.target)
        )
          out.push({
            kind: "concentration",
            regionId: r.id,
            subject:
              content.budgets.find((b) => b.key === contribution.budgetKey)
                ?.name ?? r.name,
            value: contribution.amount,
            currency: target.currency,
            evidenceKeys: [target.key, contribution.key],
          });
    }
    if (!content.team.some((t) => t.regionId === r.id && t.memberSub))
      out.push({
        kind: "team_gap",
        regionId: r.id,
        subject: r.name,
        value: null,
        currency: null,
        evidenceKeys: content.team
          .filter((t) => t.regionId === r.id)
          .map((t) => t.key),
      });
  }
  for (const sub of new Set(
    content.team.filter((t) => t.memberSub).map((t) => t.memberSub),
  )) {
    const rows = content.team.filter((t) => t.memberSub === sub);
    const max = Math.max(
      ...rows.map((r) =>
        rows
          .filter((t) => t.start <= r.start && r.start < t.end)
          .reduce((n, t) => n + t.percent, 0),
      ),
    );
    if (max > 100)
      out.push({
        kind: "over_capacity",
        regionId: null,
        subject: rows[0]!.memberName,
        value: String(max),
        currency: null,
        evidenceKeys: rows.map((t) => t.key),
      });
  }
  return out;
}
