import type { SalesPlan, PlanEvent } from "./plan-model";
import { minor, amount } from "./plan-values";
export function targetDelta(before: string | null, after: string | null) {
  if (before === null || after === null) return null;
  const old = minor(before),
    next = minor(after),
    delta = next - old;
  const magnitude = delta < 0n ? -delta : delta;
  const sign = delta < 0n ? "-" : delta > 0n ? "+" : "";
  const points = old > 0n ? (magnitude * 10000n + old / 2n) / old : null;
  return {
    amount: `${sign}${amount(magnitude)}`,
    percent: points === null ? null : `${sign}${amount(points)}%`,
  };
}
export function activeReleases(plan: SalesPlan, at: string): PlanEvent[] {
  const known = plan.events.filter((e) => e.at <= at);
  return known.filter(
    (e) =>
      e.kind === "release" &&
      !known.some((c) => c.kind === "cancel" && c.relatedNo === e.no),
  );
}
export function planVersions(plan: SalesPlan, at: string) {
  const releases = activeReleases(plan, at);
  const effective = releases
    .filter((e) => e.effectiveAt <= at)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.no - b.no);
  const revision = (e?: PlanEvent) =>
    plan.revisions.find((r) => r.id === e?.revisionId) ?? null;
  return {
    baseline: revision(effective[0]),
    current: revision(effective.at(-1)),
    scheduled: revision(releases.find((e) => e.effectiveAt > at)),
    draft: plan.revisions.find((r) => r.state === "draft") ?? null,
    closed: plan.events.some((e) => e.kind === "close" && e.at <= at),
    eventNo: plan.events.at(-1)?.no ?? 0,
  };
}
export function comparePlanContents(
  before: import("./plan-model").PlanContent | null,
  after: import("./plan-model").PlanContent,
) {
  const out: {
    section: string;
    key: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }[] = [];
  for (const section of [
    "regions",
    "periods",
    "targets",
    "budgets",
    "contributions",
    "team",
    "actions",
  ] as const) {
    const key = (x: object) =>
      String(
        (x as Record<string, unknown>).key ?? (x as Record<string, unknown>).id,
      );
    const left = new Map((before?.[section] ?? []).map((x) => [key(x), x]));
    const right = new Map(after[section].map((x) => [key(x), x]));
    for (const id of new Set([...left.keys(), ...right.keys()]))
      if (
        JSON.stringify(left.get(id) ?? null) !==
        JSON.stringify(right.get(id) ?? null)
      )
        out.push({
          section,
          key: id,
          before: (left.get(id) as unknown as Record<string, unknown>) ?? null,
          after: (right.get(id) as unknown as Record<string, unknown>) ?? null,
        });
  }
  for (const field of [
    "assumptions",
    "allocationNote",
    "capacityNote",
  ] as const)
    if (before?.[field] !== after[field])
      out.push({
        section: field,
        key: field,
        before: before ? { text: before[field] } : null,
        after: { text: after[field] },
      });
  return out;
}
