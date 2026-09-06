// 交付概览 - the numbers the delivery page opens with, cut more than one way.
// Pure: the page reads, this counts, the section renders. Built to the shape
// the collections page settled on (owner, 2026-09-06: 统计为主，列表为具体清单).
//
// THE PROCESS IS THE PRIMARY CUT, as it is for collections: a project moves
// 筹备 -> 进行中 -> 已交付 -> 已关闭, and "where is the work" is the question
// this page opens with. Who the projects belong to is what the list says, row
// by row, underneath.

export type ProjectHealth = "green" | "amber" | "red";

export interface DeliveryStatsRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly contractAmount: number | null;
  /** Health as the delivery team reported it. */
  readonly reported: ProjectHealth;
  /** Health as the facts leave it. */
  readonly derived: ProjectHealth;
  readonly managerSub: string | null;
}

export interface Bucket {
  readonly key: string;
  readonly amount: number;
  readonly count: number;
}

export interface DeliveryStats {
  /** Contract value and project count at each stage of the lifecycle. */
  readonly byStage: readonly Bucket[];
  /** How the DERIVED health is spread - what the facts say, not the report. */
  readonly byHealth: readonly Bucket[];
  /** Where the contract value is concentrated, largest first. */
  readonly byProject: readonly (Bucket & { readonly name: string })[];
  /** Projects whose report was better than the facts. */
  readonly downgraded: number;
  readonly contractTotal: number;
}

/** The lifecycle, in the order work moves through it. */
export const PROJECT_STAGES = [
  "planning",
  "active",
  "on_hold",
  "delivered",
  "closed",
  "cancelled",
] as const;

/** Worst first: a page about risk should not open with the healthy bar. */
export const HEALTH_ORDER: readonly ProjectHealth[] = ["red", "amber", "green"];

export function deliveryStats(rows: readonly DeliveryStatsRow[]): DeliveryStats {
  const sum = (list: readonly DeliveryStatsRow[]) =>
    list.reduce((n, r) => n + (r.contractAmount ?? 0), 0);

  const byStage = PROJECT_STAGES.map((stage) => {
    const at = rows.filter((r) => r.status === stage);
    return { key: stage, amount: sum(at), count: at.length };
  }).filter((b) => b.count > 0);

  // LIVE WORK ONLY. A cancelled project's health is not a finding and a closed
  // one's is history; leaving them in would make the health chart a record of
  // everything that ever happened rather than a reading of what is running.
  const live = rows.filter(
    (r) => r.status !== "closed" && r.status !== "cancelled" && r.status !== "delivered",
  );
  const byHealth = HEALTH_ORDER.map((h) => {
    const at = live.filter((r) => r.derived === h);
    return { key: h, amount: sum(at), count: at.length };
  }).filter((b) => b.count > 0);

  return {
    byStage,
    byHealth,
    byProject: [...live]
      .map((r) => ({ key: r.id, name: r.name, amount: r.contractAmount ?? 0, count: 1 }))
      .filter((p) => p.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    // THE DOWNGRADE IS THIS DOMAIN'S WHOLE POINT: "we are fine" standing next
    // to "they have not paid" is the most common way a failing engagement
    // stays green until it is a crisis. Counted on live work for the same
    // reason the health chart is.
    downgraded: live.filter((r) => worseThan(r.derived, r.reported)).length,
    contractTotal: sum(rows),
  };
}

/** Is `a` a worse reading than `b`? red > amber > green. */
export function worseThan(a: ProjectHealth, b: ProjectHealth): boolean {
  const rank: Record<ProjectHealth, number> = { green: 0, amber: 1, red: 2 };
  return rank[a] > rank[b];
}
