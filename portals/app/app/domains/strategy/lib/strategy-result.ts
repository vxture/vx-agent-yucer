import {
  uuid,
  type StrategicExpectation,
  type StrategicMetric,
} from "./expectations";

export interface StrategyOption {
  id: string;
  kind: "value" | "path";
  code: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
}
export interface StrategyGoal {
  id: string;
  name: string;
  metric: StrategicMetric | null;
  baseline: string;
  target: string;
  unit: string;
  dueOn: string;
  criterion: string;
}
export type Novelty = "existing" | "new" | "unknown";
export interface StrategyResult {
  valuePropositionId: string | null;
  goals: readonly StrategyGoal[];
  pathIds: readonly string[];
  resources: {
    people: string;
    peopleNote: string;
    funds: string;
    fundsNote: string;
    technology: string;
    technologyNote: string;
  };
  milestones: readonly {
    id: string;
    name: string;
    startOn: string;
    endOn: string;
    deliverable: string;
  }[];
  risks: readonly {
    id: string;
    kind: "assumption" | "risk";
    description: string;
    response: string;
  }[];
  markets: readonly { id: string; novelty: Novelty }[];
  offerings: readonly {
    id: string;
    kind: "product" | "solution";
    novelty: Novelty;
  }[];
  /** Reserved for future extensions; no business UI in this release. */
  extensions?: {
    dependencies?: readonly string[];
    additionalValueIds?: readonly string[];
    channels?: readonly string[];
    businessModel?: string;
  };
}
/** Same calendar as workspace business-number allocation. */
export function strategyToday(now = new Date()): string {
  const parts = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}
interface ResultSelection {
  productIds?: readonly string[];
  solutionIds?: readonly string[];
  targetMarkets?: readonly {
    segmentId: string;
    productIds?: readonly string[];
    solutionIds?: readonly string[];
  }[];
}
/** Undefined relations mean unchanged, including references unavailable to this user. */
export function alignResultRelations(
  result: StrategyResult,
  selection: ResultSelection,
  previous: ResultSelection = {},
): StrategyResult {
  const markets = selection.targetMarkets ?? previous.targetMarkets ?? [];
  const offerings = (["product", "solution"] as const).flatMap((kind) => {
    const key = kind === "product" ? "productIds" : "solutionIds";
    return [
      ...new Set([
        ...(selection[key] ?? previous[key] ?? []),
        ...markets.flatMap(
          (m) =>
            m[key] ??
            previous.targetMarkets?.find((p) => p.segmentId === m.segmentId)?.[
              key
            ] ??
            [],
        ),
      ]),
    ].map((id) => ({
      id,
      kind,
      novelty:
        result.offerings.find((o) => o.id === id && o.kind === kind)?.novelty ??
        ("unknown" as const),
    }));
  });
  return {
    ...result,
    markets: markets.map((m) => ({
      id: m.segmentId,
      novelty:
        result.markets.find((r) => r.id === m.segmentId)?.novelty ??
        ("unknown" as const),
    })),
    offerings,
  };
}
export function resultRelationsMatch(
  result: StrategyResult,
  selection: ResultSelection,
  previous: ResultSelection = {},
): boolean {
  const aligned = alignResultRelations(result, selection, previous);
  return (
    result.markets.every((m) => aligned.markets.some((r) => r.id === m.id)) &&
    result.offerings.every((o) =>
      aligned.offerings.some((r) => r.id === o.id && r.kind === o.kind),
    )
  );
}
export function emptyStrategyResult(): StrategyResult {
  return {
    valuePropositionId: null,
    goals: [],
    pathIds: [],
    resources: {
      people: "",
      peopleNote: "",
      funds: "",
      fundsNote: "",
      technology: "",
      technologyNote: "",
    },
    milestones: [],
    risks: [],
    markets: [],
    offerings: [],
  };
}
export function resultFromExpectations(
  rows: readonly StrategicExpectation[],
  dueOn: string,
): StrategyResult {
  return {
    ...emptyStrategyResult(),
    goals: rows.map((x) => ({
      id: x.id,
      metric: x.metric,
      name: x.metric,
      baseline: "",
      target: x.amount,
      unit: x.currency ?? "count",
      dueOn,
      criterion: x.criterion,
    })),
  };
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
const text = (v: unknown, max = 1000): v is string =>
  typeof v === "string" && v.length <= max;
const decimal = (v: string) =>
  /^-?(0|[1-9][0-9]{0,12})(\.[0-9]{1,4})?$/.test(v);
const uniqueIds = (rows: readonly { id: string }[]) =>
  rows.every((r) => uuid(r.id)) &&
  new Set(rows.map((r) => r.id)).size === rows.length;
export function validStrategyResult(v: unknown): v is StrategyResult {
  if (!v || typeof v !== "object") return false;
  const x = v as StrategyResult;
  if (x.valuePropositionId !== null && !uuid(x.valuePropositionId))
    return false;
  if (
    !Array.isArray(x.goals) ||
    x.goals.length > 30 ||
    !x.goals.every(
      (g) =>
        g &&
        uuid(g.id) &&
        text(g.name, 100) &&
        [null, "revenue", "channels", "reference_cases"].includes(g.metric) &&
        text(g.baseline, 32) &&
        text(g.target, 32) &&
        (!g.baseline || decimal(g.baseline)) &&
        (!g.target || decimal(g.target)) &&
        text(g.unit, 24) &&
        text(g.dueOn, 10) &&
        (!g.dueOn || validDate(g.dueOn)) &&
        text(g.criterion, 1000),
    ) ||
    !uniqueIds(x.goals)
  )
    return false;
  const metrics = x.goals.filter((g) => g.metric).map((g) => g.metric);
  if (new Set(metrics).size !== metrics.length) return false;
  if (
    !Array.isArray(x.pathIds) ||
    x.pathIds.length > 30 ||
    !x.pathIds.every(uuid) ||
    new Set(x.pathIds).size !== x.pathIds.length
  )
    return false;
  if (
    !x.resources ||
    Object.keys(x.resources).length !== 6 ||
    !["people", "funds", "technology"].every(
      (k) =>
        text(x.resources[k as keyof typeof x.resources], 32) &&
        (!x.resources[k as keyof typeof x.resources] ||
          /^\d+(\.\d{1,2})?$/.test(
            x.resources[k as keyof typeof x.resources],
          )) &&
        text(x.resources[(k + "Note") as keyof typeof x.resources], 1000),
    )
  )
    return false;
  if (
    !Array.isArray(x.milestones) ||
    x.milestones.length > 30 ||
    !x.milestones.every(
      (m) =>
        m &&
        text(m.name, 100) &&
        text(m.deliverable, 1000) &&
        [m.startOn, m.endOn].every(
          (d) => text(d, 10) && (!d || validDate(d)),
        ) &&
        (!m.startOn || !m.endOn || m.endOn >= m.startOn),
    ) ||
    !uniqueIds(x.milestones)
  )
    return false;
  if (
    !Array.isArray(x.risks) ||
    x.risks.length > 30 ||
    !x.risks.every(
      (r) =>
        r &&
        ["risk", "assumption"].includes(r.kind) &&
        text(r.description, 1000) &&
        text(r.response, 1000),
    ) ||
    !uniqueIds(x.risks)
  )
    return false;
  if (
    !Array.isArray(x.markets) ||
    x.markets.length > 100 ||
    !x.markets.every(
      (r) => r && ["existing", "new", "unknown"].includes(r.novelty),
    ) ||
    !(
      x.markets.every((r) => text(r.id, 128) && r.id.length > 0) &&
      new Set(x.markets.map((r) => r.id)).size === x.markets.length
    )
  )
    return false;
  if (
    !Array.isArray(x.offerings) ||
    x.offerings.length > 200 ||
    !x.offerings.every(
      (r) =>
        r &&
        text(r.id, 128) &&
        r.id.length > 0 &&
        ["product", "solution"].includes(r.kind) &&
        ["existing", "new", "unknown"].includes(r.novelty),
    ) ||
    new Set(x.offerings.map((r) => r.kind + ":" + r.id)).size !==
      x.offerings.length
  )
    return false;
  return true;
}
export function goalExpectations(
  result: StrategyResult,
  currency: string,
): StrategicExpectation[] {
  return result.goals.flatMap((g) =>
    g.metric && g.target !== ""
      ? [
          {
            id: g.id,
            metric: g.metric,
            amount: g.target,
            currency: g.metric === "revenue" ? currency : null,
            criterion: g.criterion,
          },
        ]
      : [],
  );
}
export interface ResultIssue {
  field: string;
  code: "required" | "invalid" | "past";
}
export function strategyResultIssues(
  x: StrategyResult,
  opts: {
    publish?: boolean;
    today?: string;
    previous?: StrategyResult | null;
  } = {},
): ResultIssue[] {
  const errors: ResultIssue[] = [];
  if (!(validStrategyResult as (v: unknown) => boolean)(x)) {
    if (Array.isArray(x?.goals))
      for (const g of x.goals) {
        for (const k of ["baseline", "target"] as const)
          if (g[k] && !decimal(g[k]))
            errors.push({ field: `goal.${g.id}.${k}`, code: "invalid" });
        if (g.dueOn && !validDate(g.dueOn))
          errors.push({ field: `goal.${g.id}.dueOn`, code: "invalid" });
      }
    return errors.length ? errors : [{ field: "result", code: "invalid" }];
  }
  if (opts.publish && !x.valuePropositionId)
    errors.push({ field: "valuePropositionId", code: "required" });
  if (opts.publish && !x.goals.length)
    errors.push({ field: "goals", code: "required" });
  x.goals.forEach((g) => {
    if (opts.publish)
      for (const k of ["name", "baseline", "target", "unit", "dueOn"] as const)
        if (!g[k].trim())
          errors.push({ field: `goal.${g.id}.${k}`, code: "required" });
    if (
      g.dueOn &&
      opts.today &&
      g.dueOn < opts.today &&
      opts.previous?.goals.find((p) => p.id === g.id)?.dueOn !== g.dueOn
    )
      errors.push({ field: `goal.${g.id}.dueOn`, code: "past" });
  });
  return errors;
}
export function advancedFilled(x: StrategyResult): number {
  return (
    Number(x.pathIds.length > 0) +
    Number(Object.values(x.resources).some((v) => v.trim() !== "")) +
    Number(
      x.milestones.some(
        (m) => m.name.trim() || m.startOn || m.endOn || m.deliverable.trim(),
      ),
    ) +
    Number(x.risks.some((r) => r.description.trim() || r.response.trim()))
  );
}
export function consistencyWarnings(
  code: string | null | undefined,
  x: StrategyResult,
): string[] {
  const markets = x.markets.map((r) => r.novelty),
    products = x.offerings.map((r) => r.novelty);
  const rules: Record<string, readonly [string, boolean][]> = {
    "market-depth": [
      ["new-market", markets.includes("new")],
      ["new-product", products.includes("new")],
    ],
    "market-expansion": [["new-product", products.includes("new")]],
    "product-innovation": [["new-market", markets.includes("new")]],
    diversification: [
      ["existing-market", markets.includes("existing")],
      ["existing-product", products.includes("existing")],
    ],
  };
  return (rules[code ?? ""] ?? []).filter(([, yes]) => yes).map(([key]) => key);
}
