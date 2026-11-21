import type {
  PlanContent,
  PlanTarget,
} from "../../domains/planning/plan-model";
import { amount, demand, minor } from "../../domains/planning/plan-values";

const tiers = ["floor", "target", "stretch"] as const;
type Tier = (typeof tiers)[number];
const unit = (line: PlanTarget) => (line.metric === "new_logo" ? 100n : 1n);
function displayAmount(value: bigint, line: PlanTarget) {
  return line.metric === "new_logo" ? String(value / 100n) : amount(value);
}
function weighted(value: string | null, percent: number, line: PlanTarget) {
  if (value === null) return null;
  return displayAmount(
    (((minor(value) / unit(line)) * BigInt(percent)) / 100n) * unit(line),
    line,
  );
}

// Q4 is always the exact remainder. Integer counts and cents never drift.
export function autofillPlanningQuarters(
  content: PlanContent,
  annual: PlanTarget,
  locked: readonly string[] = [],
): PlanContent {
  const next = structuredClone(content);
  const quarters = next.periods
    .filter((p) => p.parent === annual.period && /^\d{4}Q[1-4]$/.test(p.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  if (quarters.length !== 4) return next;
  const rows = quarters.map((p) => {
    let row = next.targets.find(
      (t) =>
        t.scope === annual.scope &&
        t.metric === annual.metric &&
        t.currency === annual.currency &&
        t.period === p.key,
    );
    if (!row) {
      row = { ...annual, key: crypto.randomUUID(), period: p.key, note: "" };
      next.targets.push(row);
    }
    return row;
  });
  const fixed = rows
    .filter((r) => locked.includes(r.period))
    .reduce((sum, r) => sum + (r.target === null ? 0n : minor(r.target)), 0n);
  const editable = rows.filter((r) => !locked.includes(r.period));
  const available =
    annual.target === null ? null : minor(annual.target) - fixed;
  demand(available === null || available >= 0n, "closed_period_changed");
  const revenueWeights = new Map(
    next.targets
      .filter(
        (t) =>
          t.scope === annual.scope &&
          t.metric === "revenue" &&
          t.period !== annual.period &&
          t.target !== null,
      )
      .map((t) => [t.period, minor(t.target!)]),
  );
  const useRevenue =
    annual.metric !== "revenue" &&
    editable.every((r) => revenueWeights.has(r.period)) &&
    editable.some((r) => revenueWeights.get(r.period)! > 0n);
  const weightFor = (r: PlanTarget) =>
    useRevenue
      ? revenueWeights.get(r.period)!
      : BigInt(Number(r.period.at(-1)));
  const weight = editable.reduce((sum, r) => sum + weightFor(r), 0n);
  let assigned = 0n;
  editable.forEach((r, index) => {
    const value =
      available === null
        ? null
        : index === editable.length - 1
          ? available - assigned
          : (((available / unit(annual)) * weightFor(r)) / weight) *
            unit(annual);
    r.target = value === null ? null : displayAmount(value, annual);
    r.floor = null;
    r.stretch = null;
    assigned += value ?? 0n;
  });
  return next;
}

export function updatePlanningAmount(
  content: PlanContent,
  key: string,
  tier: Tier,
  value: string,
  locked: readonly string[] = [],
): PlanContent {
  const next = structuredClone(content);
  const line = next.targets.find((t) => t.key === key)!;
  line[tier] = value.trim() || null;
  if (locked.includes(line.period)) return content;
  // Keep incomplete user input in the draft editor; saving still validates it.
  try {
    if (line[tier] !== null) minor(line[tier]!);
    if (
      tier === "target" &&
      line.period === `Y${content.year}` &&
      line.metric !== "margin"
    ) {
      line.floor = weighted(line.target, 60, line);
      line.stretch = weighted(line.target, 120, line);
    }
    if (line.period === `Y${content.year}`) {
      let filled = autofillPlanningQuarters(next, line, locked);
      if (line.metric === "revenue") {
        const oldRevenue = content.targets.find((t) => t.key === line.key)!;
        const margin = filled.targets.find(
          (t) =>
            t.scope === line.scope &&
            t.period === line.period &&
            t.metric === "margin" &&
            t.currency === line.currency,
        );
        if (margin) {
          for (const field of tiers) {
            const rate = { floor: 30, target: 40, stretch: 50 }[field];
            if (
              margin[field] === null ||
              margin[field] === weighted(oldRevenue[field], rate, line)
            )
              margin[field] = weighted(line[field], rate, line);
          }
          filled = autofillPlanningQuarters(filled, margin, locked);
        }
      }
      if (line.metric === "revenue")
        for (const auxiliary of filled.targets.filter(
          (t) =>
            t.scope === line.scope &&
            t.period === line.period &&
            t.metric !== "revenue",
        ))
          filled = autofillPlanningQuarters(filled, auxiliary, locked);
      return filled;
    }
    const annual = next.targets.find(
      (t) =>
        t.scope === line.scope &&
        t.metric === line.metric &&
        t.currency === line.currency &&
        t.period === `Y${content.year}`,
    );
    const last = next.targets.find(
      (t) =>
        t.scope === line.scope &&
        t.metric === line.metric &&
        t.currency === line.currency &&
        t.period === `${content.year}Q4`,
    );
    if (annual && last && !locked.includes(last.period)) {
      for (const field of ["target"] as const) {
        if (annual[field] === null) continue;
        const used = next.targets
          .filter(
            (t) =>
              t.scope === line.scope &&
              t.metric === line.metric &&
              t.currency === line.currency &&
              [1, 2, 3].some(q => t.period === `${content.year}Q${q}`),
          )
          .reduce(
            (sum, t) => sum + (t[field] === null ? 0n : minor(t[field]!)),
            0n,
          );
        const remainder = minor(annual[field]!) - used;
        // An impossible breakdown stays visible for correction, never clamped to zero.
        if (remainder >= 0n) last[field] = displayAmount(remainder, line);
      }
    }
    if (line.metric === "revenue") {
      let filled = next;
      for (const auxiliary of next.targets.filter(
        (t) =>
          t.scope === line.scope &&
          t.period === `Y${content.year}` &&
          t.metric !== "revenue",
      ))
        filled = autofillPlanningQuarters(filled, auxiliary, locked);
      return filled;
    }
  } catch {
    /* Preserve typed input; domain validation reports the specific error. */
  }
  return next;
}

export function addPlanningMetric(
  content: PlanContent,
  scope: string,
  metric: PlanTarget["metric"],
  locked: readonly string[] = [],
) {
  if (content.targets.some(t => t.scope === scope && t.period === `Y${content.year}` && t.metric === metric)) return content;
  const revenue = content.targets.find(
    (t) =>
      t.scope === scope &&
      t.metric === "revenue" &&
      t.period === `Y${content.year}`,
  );
  const line: PlanTarget = {
    key: crypto.randomUUID(),
    scope,
    period: `Y${content.year}`,
    metric,
    currency: metric === "new_logo" ? null : (revenue?.currency ?? "CNY"),
    floor: null,
    target: null,
    stretch: null,
    note: "",
  };
  // Unlike monetary metrics, a customer count has no meaningful conversion from revenue.
  if (metric === "margin" && revenue) {
    for (const tier of tiers)
      line[tier] = weighted(
        revenue[tier],
        { floor: 30, target: 40, stretch: 50 }[tier],
        revenue,
      );
  }
  return autofillPlanningQuarters(
    { ...content, targets: [...content.targets, line] },
    line,
    locked,
  );
}

// Allocate each company quarter first, then derive regional annual amounts.
// This preserves both allocation axes, even for tiny amounts and customer counts.
export function autofillPlanningRegions(content: PlanContent): PlanContent {
  const next = structuredClone(content);
  const regions = next.regions.filter((r) => r.included);
  if (!regions.length) return next;
  const matches = (a: PlanTarget, b: PlanTarget) =>
    a.metric === b.metric && a.currency === b.currency;
  const missing = next.targets.filter(
    (t) =>
      t.scope === "workspace" &&
      t.period === `Y${next.year}` &&
      !next.targets.some(
        (r) => r.scope !== "workspace" && matches(t, r) && r.target !== null,
      ),
  );
  const company = next.targets.filter(
    (t) => t.scope === "workspace" && missing.some((m) => matches(m, t)),
  );
  if (!company.length) return next;
  next.targets = next.targets.filter(
    (t) => t.scope === "workspace" || !missing.some((m) => matches(m, t)),
  );
  const generated = new Set<string>();
  for (const source of company) {
    const rows = regions.map((r) => ({
      ...source,
      key: crypto.randomUUID(),
      scope: `territory:${r.id}`,
      note: "",
    }));
    const previous = rows.map(() => 0n);
    let previousTotal = 0n;
    for (const tier of tiers) {
      if (source[tier] === null) continue;
      const total = minor(source[tier]!);
      const delta = total - previousTotal;
      demand(delta >= 0n, "target_ladder");
      let assigned = 0n;
      rows.forEach((line, index) => {
        const increment =
          index === rows.length - 1
            ? delta - assigned
            : (delta / unit(source) / BigInt(rows.length)) * unit(source);
        previous[index] += increment;
        line[tier] = displayAmount(previous[index], source);
        assigned += increment;
      });
      previousTotal = total;
    }
    rows.forEach((line) => generated.add(line.key));
    next.targets.push(...rows);
  }
  for (const annual of next.targets.filter(
    (t) =>
      generated.has(t.key) &&
      t.period === `Y${next.year}` &&
      t.metric !== "pipeline",
  )) {
    const quarters = next.targets.filter(
      (t) =>
        t.scope === annual.scope &&
        t.metric === annual.metric &&
        t.currency === annual.currency &&
        t.period !== annual.period,
    );
    if (!quarters.length) continue;
    for (const tier of ["target"] as const)
      if (quarters.every((t) => t[tier] !== null))
        annual[tier] = displayAmount(
          quarters.reduce((n, t) => n + minor(t[tier]!), 0n),
          annual,
        );
  }
  for (const base of company.filter((t) => t.period === `Y${next.year}`)) {
    const annuals = next.targets.filter(
      (t) =>
        t.scope !== "workspace" &&
        t.period === base.period &&
        t.metric === base.metric &&
        t.currency === base.currency,
    );
    // Distribute floor within each region's capacity, then stretch above its target.
    let floorLeft = base.floor === null ? null : minor(base.floor);
    let targetLeft = base.target === null ? 0n : minor(base.target);
    let stretchExtra =
      base.stretch === null || base.target === null
        ? null
        : minor(base.stretch) - minor(base.target);
    annuals.forEach((line, i) => {
      const target = line.target === null ? 0n : minor(line.target);
      if (floorLeft !== null) {
        const value =
          i === annuals.length - 1
            ? floorLeft
            : targetLeft === 0n
              ? 0n
              : ((floorLeft * target) / targetLeft / unit(line)) * unit(line);
        line.floor = displayAmount(value, line);
        floorLeft -= value;
      }
      if (stretchExtra !== null) {
        const extra =
          i === annuals.length - 1
            ? stretchExtra
            : (stretchExtra / BigInt(annuals.length - i) / unit(line)) *
              unit(line);
        line.stretch = displayAmount(target + extra, line);
        stretchExtra -= extra;
      }
      targetLeft -= target;
    });
  }
  return next;
}
