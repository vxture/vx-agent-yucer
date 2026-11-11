// Versioned, atomic D2 planning aggregate. Decimal amounts are canonical strings.
import { createHash, randomUUID } from "node:crypto";
import { periodRange } from "../shared/period";
import type { TargetMetric } from "./lib/target";

export interface PlanPeriod {
  key: string;
  parent: string | null;
  start: string;
  end: string;
}
export interface PlanRegion {
  id: string;
  divisionId: string;
  code: string;
  name: string;
  provinces: string[];
  included: boolean;
  reason: string;
  ownerSub: string | null;
}
export interface PlanTarget {
  key: string;
  scope: string;
  period: string;
  metric: TargetMetric;
  currency: string | null;
  floor: string | null;
  target: string | null;
  stretch: string | null;
  note: string;
}
export interface CustomerBudget {
  key: string;
  accountId: string;
  name: string;
  tier: string;
  period: string;
  metric: TargetMetric;
  currency: string | null;
  amount: string;
  sourcePlanId: string | null;
  sourceReadAt: string;
  note: string;
}
export interface CustomerContribution {
  key: string;
  budgetKey: string;
  targetKey: string;
  regionId: string;
  responsibility: "primary" | "support";
  amount: string;
}
export interface TeamAllocation {
  key: string;
  regionId: string;
  memberSub: string | null;
  memberName: string;
  unitId: string | null;
  unitName: string;
  role: string;
  start: string;
  end: string;
  percent: number;
  requestedFte: string | null;
  note: string;
}
export interface PlanAction {
  key: string;
  regionId: string;
  targetKey: string | null;
  accountId: string | null;
  objective: string;
  ownerSub: string | null;
  due: string;
  evidenceRefs: string[];
}
export interface PlanContent {
  schemaVersion: 1;
  year: number;
  periods: PlanPeriod[];
  regions: PlanRegion[];
  targets: PlanTarget[];
  budgets: CustomerBudget[];
  contributions: CustomerContribution[];
  team: TeamAllocation[];
  actions: PlanAction[];
  assumptions: string;
  allocationNote: string;
  capacityNote: string;
}
export interface PlanRevision {
  id: string;
  state: "draft" | "sealed" | "abandoned";
  editToken: number;
  version: number | null;
  baseId: string | null;
  restoresId: string | null;
  content: PlanContent;
  contentHash: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
  sealedBy: string | null;
  sealedAt: string | null;
}
export interface PlanEvent {
  no: number;
  kind: "draft" | "save" | "release" | "cancel" | "discard" | "lock" | "close";
  revisionId: string | null;
  relatedNo: number | null;
  period: string | null;
  at: string;
  effectiveAt: string;
  actor: string;
  reason: string;
  requestKey: string;
  requestHash: string;
}
export interface LegacyAdoption {
  targetId: string;
  revisionId: string;
  snapshot: unknown;
}
export interface SalesPlan {
  id: string;
  workspaceId: string;
  year: number;
  revisions: PlanRevision[];
  events: PlanEvent[];
  legacy: LegacyAdoption[];
}
import { demand, minor, canonical } from "./plan-values";
export { PlanError, demand, minor, amount, canonical } from "./plan-values";
export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function newKey(): string {
  return randomUUID();
}
export { planVersions } from "./plan-state";
import { planVersions } from "./plan-state";
const metrics = new Set(["revenue", "new_logo", "pipeline", "margin"]);
const isoDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(value).toISOString().slice(0, 10) === value;
function unique(keys: string[], field: string) {
  demand(
    new Set(keys).size === keys.length &&
      keys.every(
        (k) => typeof k === "string" && k.length > 0 && k.length <= 160,
      ),
    "duplicate_line",
    field,
  );
}
const identity = (t: PlanTarget) =>
  [t.scope, t.period, t.metric, t.currency].join("|");
export function validateContent(c: PlanContent, publish: boolean): void {
  demand(
    c &&
      c.schemaVersion === 1 &&
      Number.isInteger(c.year) &&
      c.year >= 2000 &&
      c.year <= 2200,
    "invalid_plan",
  );
  for (const field of [
    "periods",
    "regions",
    "targets",
    "budgets",
    "contributions",
    "team",
    "actions",
  ] as const)
    demand(
      Array.isArray(c[field]) && c[field].length <= 2000,
      "invalid_plan",
      field,
    );
  for (const field of [
    "assumptions",
    "allocationNote",
    "capacityNote",
  ] as const)
    demand(
      typeof c[field] === "string" && c[field].length <= 8000,
      "invalid_plan",
      field,
    );
  demand(JSON.stringify(c).length <= 1_000_000, "plan_too_large");
  unique(
    c.periods.map((p) => p.key),
    "periods",
  );
  unique(
    c.regions.map((r) => r.id),
    "regions",
  );
  unique(
    c.targets.map((t) => t.key),
    "targets",
  );
  unique(c.targets.map(identity), "targets");
  unique(
    c.budgets.map((b) => b.key),
    "budgets",
  );
  unique(
    c.budgets.map((b) =>
      [b.accountId, b.period, b.metric, b.currency].join("|"),
    ),
    "budgets",
  );
  unique(
    c.contributions.map((x) => x.key),
    "contributions",
  );
  unique(
    c.team.map((x) => x.key),
    "team",
  );
  unique(
    c.actions.map((x) => x.key),
    "actions",
  );
  const root = c.periods.find((p) => p.key === `Y${c.year}`);
  demand(
    root &&
      root.parent === null &&
      root.start === `${c.year}-01-01` &&
      root.end === `${c.year + 1}-01-01`,
    "invalid_period",
  );
  for (const p of c.periods) {
    const range = periodRange(p.key);
    demand(
      isoDate(p.start) &&
        isoDate(p.end) &&
        p.start < p.end &&
        range &&
        range.start.toISOString().slice(0, 10) === p.start &&
        range.end.toISOString().slice(0, 10) === p.end,
      "invalid_period",
    );
    if (p !== root) {
      const parent = c.periods.find((x) => x.key === p.parent);
      demand(
        parent &&
          parent.start <= p.start &&
          p.end <= parent.end &&
          parent.key !== p.key &&
          (parent.start < p.start || p.end < parent.end),
        "invalid_period",
      );
    }
    demand(
      !c.periods.some(
        (x) =>
          x.key !== p.key &&
          x.parent === p.parent &&
          x.start < p.end &&
          p.start < x.end,
      ),
      "overlapping_period",
    );
  }
  for (const r of c.regions) {
    demand(
      typeof r.included === "boolean" &&
        r.name.trim() &&
        r.code &&
        Array.isArray(r.provinces),
      "invalid_region",
    );
    if (publish && !r.included)
      demand(r.reason.trim(), "exclusion_reason_required");
  }
  const scopeValid = (scope: string) =>
    scope === "workspace" ||
    c.regions.some((r) => `territory:${r.id}` === scope && r.included);
  const valueValid = (v: string, metric: string) => {
    minor(v);
    if (metric === "new_logo") demand(minor(v) % 100n === 0n, "count_integer");
  };
  for (const t of c.targets) {
    demand(
      scopeValid(t.scope) &&
        c.periods.some((p) => p.key === t.period) &&
        metrics.has(t.metric),
      "invalid_target",
    );
    demand(
      t.metric === "new_logo"
        ? t.currency === null
        : typeof t.currency === "string" && /^[A-Z]{3}$/.test(t.currency),
      "currency_mismatch",
    );
    const values = [t.floor, t.target, t.stretch].filter(
      (v): v is string => v !== null,
    );
    values.forEach((v) => valueValid(v, t.metric));
    demand(
      values.every((v, i) => i === 0 || minor(values[i - 1]!) <= minor(v)),
      "target_ladder",
    );
    if (publish) demand(t.target !== null, "target_required");
  }
  if (publish) {
    demand(
      c.targets.some(
        (t) =>
          t.scope === "workspace" &&
          t.period === root.key &&
          t.metric === "revenue" &&
          t.target !== null,
      ),
      "workspace_target_required",
    );
    for (const r of c.regions.filter((r) => r.included))
      demand(
        c.targets.some(
          (t) =>
            t.scope === `territory:${r.id}` &&
            t.period === root.key &&
            t.metric === "revenue" &&
            t.target !== null,
        ),
        "region_target_required",
        r.id,
      );
  }
  const sum = (rows: PlanTarget[], tier: "floor" | "target" | "stretch") =>
    rows.reduce((n, t) => n + (t[tier] === null ? 0n : minor(t[tier]!)), 0n);
  for (const t of c.targets)
    for (const tier of ["floor", "target", "stretch"] as const) {
      const axes: PlanTarget[][] = [];
      if (t.scope === "workspace")
        axes.push(
          c.targets.filter(
            (x) =>
              x.scope !== "workspace" &&
              x.period === t.period &&
              x.metric === t.metric &&
              x.currency === t.currency,
          ),
        );
      if (t.metric !== "pipeline")
        axes.push(
          c.targets.filter(
            (x) =>
              x.scope === t.scope &&
              x.metric === t.metric &&
              x.currency === t.currency &&
              c.periods.find((p) => p.key === x.period)?.parent === t.period,
          ),
        );
      for (const rows of axes.filter((x) => x.length)) {
        if (t[tier] !== null) {
          demand(sum(rows, tier) <= minor(t[tier]!), "overallocated");
          if (
            publish &&
            (rows.some((r) => r[tier] === null) ||
              sum(rows, tier) < minor(t[tier]!))
          )
            demand(c.allocationNote.trim(), "allocation_note_required");
        }
      }
    }
  if (publish && !c.regions.some((r) => r.included))
    demand(c.allocationNote.trim(), "allocation_note_required");
  for (const b of c.budgets) {
    demand(
      b.accountId &&
        b.name.trim() &&
        metrics.has(b.metric) &&
        c.periods.some((p) => p.key === b.period) &&
        (b.metric === "new_logo"
          ? b.currency === null
          : /^[A-Z]{3}$/.test(b.currency ?? "")),
      "invalid_budget",
    );
    valueValid(b.amount, b.metric);
    if (publish && !b.sourcePlanId)
      demand(b.note.trim(), "budget_basis_required");
  }
  for (const x of c.contributions) {
    const b = c.budgets.find((b) => b.key === x.budgetKey);
    const t = c.targets.find((t) => t.key === x.targetKey);
    demand(
      b &&
        t &&
        t.scope === `territory:${x.regionId}` &&
        b.period === t.period &&
        b.metric === t.metric &&
        b.currency === t.currency &&
        ["primary", "support"].includes(x.responsibility),
      "invalid_contribution",
    );
    valueValid(x.amount, b.metric);
  }
  for (const b of c.budgets)
    demand(
      c.contributions
        .filter((x) => x.budgetKey === b.key)
        .reduce((n, x) => n + minor(x.amount), 0n) <= minor(b.amount),
      "budget_overallocated",
    );
  for (const t of c.targets.filter((t) => t.target !== null))
    demand(
      c.contributions
        .filter((x) => x.targetKey === t.key)
        .reduce((n, x) => n + minor(x.amount), 0n) <= minor(t.target!),
      "contribution_overallocated",
    );
  for (const x of c.team) {
    demand(
      c.regions.some((r) => r.id === x.regionId && r.included) &&
        isoDate(x.start) &&
        isoDate(x.end) &&
        x.start < x.end &&
        root.start <= x.start &&
        x.end <= root.end &&
        x.role.trim() &&
        Number.isFinite(x.percent) &&
        x.percent >= 0 &&
        x.percent <= 100,
      "invalid_resource",
    );
    demand(
      x.memberSub
        ? x.requestedFte === null
        : x.requestedFte !== null && minor(x.requestedFte) > 0n,
      "invalid_resource",
    );
    if (x.memberSub)
      for (const at of c.team
        .filter((y) => y.memberSub === x.memberSub)
        .map((y) => y.start)) {
        const pct = c.team
          .filter(
            (y) => y.memberSub === x.memberSub && y.start <= at && at < y.end,
          )
          .reduce((n, y) => n + y.percent, 0);
        if (publish && pct > 100)
          demand(c.capacityNote.trim(), "capacity_note_required");
      }
  }
  for (const x of c.actions)
    demand(
      x.objective.trim() &&
        c.regions.some((r) => r.id === x.regionId && r.included) &&
        (!x.targetKey ||
          c.targets.some(
            (t) =>
              t.key === x.targetKey && t.scope === `territory:${x.regionId}`,
          )) &&
        isoDate(x.due) &&
        root.start <= x.due &&
        x.due < root.end &&
        Array.isArray(x.evidenceRefs) &&
        (!publish || x.ownerSub),
      "invalid_action",
    );
}
export function closedSlice(c: PlanContent, period: string) {
  const p = c.periods.find((p) => p.key === period);
  demand(p, "closed_period_changed");
  const within = new Set(
    c.periods
      .filter((x) => p.start <= x.start && x.end <= p.end)
      .map((x) => x.key),
  );
  const targets = c.targets.filter((x) => within.has(x.period));
  const budgetKeys = new Set(
    c.budgets.filter((b) => within.has(b.period)).map((b) => b.key),
  );
  return {
    periods: c.periods.filter((x) => within.has(x.key)),
    targets,
    budgets: c.budgets.filter((b) => budgetKeys.has(b.key)),
    contributions: c.contributions.filter(
      (x) =>
        budgetKeys.has(x.budgetKey) ||
        targets.some((t) => t.key === x.targetKey),
    ),
    team: c.team
      .filter((x) => x.start < p.end && p.start < x.end)
      .map((x) => ({
        ...x,
        key: undefined,
        start: x.start < p.start ? p.start : x.start,
        end: x.end > p.end ? p.end : x.end,
      }))
      .sort((a, b) => canonical(a).localeCompare(canonical(b))),
    regions: c.regions.map((r) => ({ ...r })),
    actions: c.actions.filter((a) => p.start <= a.due && a.due < p.end),
  };
}
export function validateRevision(
  plan: SalesPlan,
  content: PlanContent,
  at: string,
) {
  demand(content.year === plan.year, "invalid_period");
  validateContent(content, true);
  const current = planVersions(plan, at).current;
  if (current) {
    for (const e of plan.events.filter((e) => e.kind === "lock"))
      demand(
        digest(closedSlice(current.content, e.period!)) ===
          digest(closedSlice(content, e.period!)),
        "closed_period_changed",
      );
    for (const t of content.targets) {
      const old = current.content.targets.find((x) => x.key === t.key);
      demand(!old || identity(t) === identity(old), "line_identity_changed");
    }
  }
}
export function emptyContent(
  year: number,
  regions: PlanRegion[],
  currency: string,
): PlanContent {
  const root = `Y${year}`;
  return {
    schemaVersion: 1,
    year,
    periods: [root, ...[1, 2, 3, 4].map((q) => `${year}Q${q}`)].map((key) => {
      const range = periodRange(key)!;
      return {
        key,
        parent: key === root ? null : root,
        start: range.start.toISOString().slice(0, 10),
        end: range.end.toISOString().slice(0, 10),
      };
    }),
    regions,
    targets: [
      "workspace",
      ...regions.filter((r) => r.included).map((r) => `territory:${r.id}`),
    ].flatMap((scope) =>
      [root].map((period) => ({
        key: newKey(),
        scope,
        period,
        metric: "revenue" as const,
        currency,
        floor: null,
        target: null,
        stretch: null,
        note: "",
      })),
    ),
    budgets: [],
    contributions: [],
    team: [],
    actions: [],
    assumptions: "",
    allocationNote: "",
    capacityNote: "",
  };
}
