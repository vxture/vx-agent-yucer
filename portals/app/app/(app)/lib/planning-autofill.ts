import { defaultNewLogoEstimate, estimateNewLogos, newLogoRevenue, type NewLogoEstimate } from "../../domains/planning/new-logo-estimate";
import type {
  PlanContent,
  PlanTarget,
} from "../../domains/planning/plan-model";
import { amount, demand, minor } from "../../domains/planning/plan-values";

import {
  defaultMarginRates,
  marginAmount,
  planningMarginRate,
} from "../../domains/planning/plan-margin";

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
    if (!row && locked.includes(p.key)) return null;
    if (!row) {
      row = { ...annual, key: crypto.randomUUID(), period: p.key, note: "" };
      delete row.marginRates;
      delete row.newLogoEstimate;
      next.targets.push(row);
    }
    return row;
  }).filter((row): row is PlanTarget => row !== null);
  const fixed = rows
    .filter((r) => locked.includes(r.period))
    .reduce((sum, r) => sum + (r.target === null ? 0n : minor(r.target)), 0n);
  const editable = rows.filter((r) => !locked.includes(r.period));
  const available =
    annual.target === null ? null : minor(annual.target) - fixed;
  demand(available === null || available >= 0n, "closed_period_changed");
  // Regional revenue follows the published company calendar; auxiliary
  // metrics follow revenue within their own scope. Company values stay read-only.
  const weightScope = annual.metric === "revenue" && annual.scope !== "workspace"
    ? "workspace" : annual.scope;
  const revenueWeights = new Map(
    next.targets
      .filter(
        (t) =>
          t.scope === weightScope &&
          t.metric === "revenue" &&
          (annual.currency === null || t.currency === annual.currency) &&
          t.period !== annual.period &&
          t.target !== null,
      )
      .map((t) => [t.period, minor(t.target!)]),
  );
  const useRevenue =
    (annual.metric !== "revenue" || annual.scope !== "workspace") &&
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
  if (line.newLogoEstimate) line.newLogoEstimate.automatic = false;
  if (line.metric === "margin") delete line.marginRates; // Legacy amount callers remain explicitly amount-based.
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
      if (line.metric === "revenue") filled = refreshNewLogoEstimates(filled, line.scope, locked);
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
              margin.marginRates ||
              margin[field] === null ||
              margin[field] === weighted(oldRevenue[field], rate, line)
            )
              margin[field] = margin.marginRates
                ? marginAmount(line.target, margin.marginRates[field])
                : weighted(line[field], rate, line);
          }
          filled = autofillPlanningQuarters(filled, margin, locked);
        }
      }
      if (line.metric === "revenue") {
        const pipeline = filled.targets.find(
          (t) =>
            t.scope === line.scope &&
            t.period === line.period &&
            t.metric === "pipeline" &&
            t.currency === line.currency,
        );
        const oldRevenue = content.targets.find((t) => t.key === line.key)!;
        if (pipeline)
          for (const field of tiers) {
            if (pipeline[field] === null) {
              const base = weighted(line.target, 300, line);
              pipeline[field] =
                field === "target"
                  ? base
                  : weighted(base, field === "floor" ? 60 : 120, line);
            } else if (
              oldRevenue.target !== null &&
              minor(oldRevenue.target) > 0n &&
              line.target !== null
            ) {
              pipeline[field] = amount(
                (minor(pipeline[field]!) * minor(line.target)) /
                  minor(oldRevenue.target),
              );
            }
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
              [1, 2, 3].some((q) => t.period === `${content.year}Q${q}`),
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
  if (
    content.targets.some(
      (t) =>
        t.scope === scope &&
        t.period === `Y${content.year}` &&
        t.metric === metric,
    )
  )
    return content;
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
  const company = scope === "workspace" ? null : content.targets.find(
    t => t.scope === "workspace" && t.period === line.period && t.metric === metric,
  );
  if (company) {
    line.currency = company.currency;
    const baseline = content.targets.find(t => t.scope === "workspace" && t.period === line.period && t.metric === "revenue" && t.currency === revenue?.currency);
    if (metric === "margin" && company.marginRates) {
      line.marginRates = { ...company.marginRates };
      for (const tier of tiers) line[tier] = marginAmount(revenue?.target ?? null, line.marginRates[tier]);
    } else if (revenue?.target != null && baseline?.target != null && minor(baseline.target) > 0n) {
      for (const tier of tiers) line[tier] = company[tier] === null ? null : displayAmount(
        (minor(company[tier]!) * minor(revenue.target) / minor(baseline.target) / unit(line)) * unit(line), line,
      );
    }
    return autofillPlanningQuarters({ ...content, targets: [...content.targets, line] }, line, locked);
  }
  if (metric === "new_logo" && revenue) {
    line.newLogoEstimate = defaultNewLogoEstimate(revenue.currency!);
    fillNewLogoEstimate(line, revenue.target);
  }
  if (metric === "margin") {
    line.marginRates = { ...defaultMarginRates };
    for (const tier of tiers)
      line[tier] = marginAmount(
        revenue?.target ?? null,
        line.marginRates[tier],
      );
  }
  if (metric === "pipeline" && revenue) {
    line.target = weighted(revenue.target, 300, revenue);
    line.floor = weighted(line.target, 60, revenue);
    line.stretch = weighted(line.target, 120, revenue);
  }
  return autofillPlanningQuarters(
    { ...content, targets: [...content.targets, line] },
    line,
    locked,
  );
}

export function updatePlanningMarginRate(
  content: PlanContent,
  key: string,
  tier: Tier,
  value: string,
  locked: readonly string[] = [],
): PlanContent {
  const line = content.targets.find((t) => t.key === key);
  if (
    !line ||
    line.metric !== "margin" ||
    line.period !== `Y${content.year}` ||
    locked.includes(line.period)
  )
    return content;
  const next = structuredClone(content);
  const margin = next.targets.find((t) => t.key === key)!;
  margin.marginRates = Object.fromEntries(
    tiers.map((field) => [field, planningMarginRate(content, line, field)]),
  ) as NonNullable<PlanTarget["marginRates"]>;
  margin.marginRates[tier] = value.trim() || null;
  const revenue = next.targets.find(
    (t) =>
      t.scope === line.scope &&
      t.period === line.period &&
      t.metric === "revenue" &&
      t.currency === line.currency,
  );
  try {
    for (const field of tiers)
      margin[field] = marginAmount(
        revenue?.target ?? null,
        margin.marginRates[field],
      );
    return autofillPlanningQuarters(next, margin, locked);
  } catch {
    return next;
  }
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
  for (const source of [...company].sort((a, b) => Number(b.period === `Y${next.year}`) - Number(a.period === `Y${next.year}`) || a.period.localeCompare(b.period))) {
    const rows = regions.map((r) => ({
      ...source,
      key: crypto.randomUUID(),
      scope: `territory:${r.id}`,
      note: "",
    }));
    rows.forEach((row) => {
      delete row.marginRates;
      delete row.newLogoEstimate;
    });
    const previous = rows.map(() => 0n);
    let previousTotal = 0n;
    for (const tier of tiers) {
      if (source[tier] === null) continue;
      const total = minor(source[tier]!);
      if (source.metric === "new_logo" && source.period === `Y${next.year}`) {
        const count = total / 100n, n = BigInt(rows.length);
        rows.forEach((line, index) => { line[tier] = String(count / n + (BigInt(index) < count % n ? 1n : 0n)); });
        continue;
      }
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
    if (source.metric === "new_logo" && source.period !== `Y${next.year}` && source.target !== null) balanceQuarterCounts(next, source, rows);
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

// Whole customers are balanced against annual regional capacity, not all sent
// to the final region each quarter when a quarterly total is smaller than N.
function balanceQuarterCounts(content: PlanContent, source: PlanTarget, rows: PlanTarget[]) {
  const capacities = rows.map(row => {
    const annual = content.targets.find(t => t.scope === row.scope && t.period === `Y${content.year}` && t.metric === "new_logo");
    const used = content.targets.filter(t => t.scope === row.scope && t.metric === "new_logo" && t.period !== `Y${content.year}`).reduce((n, t) => n + minor(t.target ?? "0") / 100n, 0n);
    return { row, capacity: minor(annual?.target ?? "0") / 100n - used, count: 0n, remainder: 0n };
  });
  const capacity = capacities.reduce((n, item) => n + item.capacity, 0n);
  const count = minor(source.target!) / 100n;
  demand(count <= capacity, "overallocated");
  if (capacity === 0n) return;
  for (const item of capacities) { item.count = count * item.capacity / capacity; item.remainder = count * item.capacity % capacity; }
  let rest = count - capacities.reduce((n, item) => n + item.count, 0n);
  for (const item of [...capacities].sort((a, b) => a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : 0)) {
    if (rest > 0n) { item.count++; rest--; }
    item.row.target = String(item.count);
  }
}

function fillNewLogoEstimate(line: PlanTarget, revenue: string | null) {
  if (!line.newLogoEstimate?.automatic) return;
  const total = estimateNewLogos(revenue, line.newLogoEstimate);
  line.target = total;
  line.floor = weighted(total, 60, line);
  line.stretch = weighted(total, 120, line);
}
function refreshNewLogoEstimates(content: PlanContent, scope: string, locked: readonly string[]) {
  let next = content;
  for (const line of next.targets.filter(t => t.scope === scope && t.period === `Y${next.year}` && t.newLogoEstimate?.automatic)) {
    fillNewLogoEstimate(line, newLogoRevenue(next, line)?.target ?? null);
    next = autofillPlanningQuarters(next, line, locked);
  }
  return next;
}
export function updateNewLogoEstimate(content: PlanContent, key: string, basis: NewLogoEstimate, locked: readonly string[] = []) {
  const next = structuredClone(content), line = next.targets.find(t => t.key === key);
  if (!line || line.metric !== "new_logo" || line.period !== `Y${next.year}` || locked.includes(line.period)) return content;
  line.newLogoEstimate = { ...basis, automatic: true };
  fillNewLogoEstimate(line, newLogoRevenue(next, line)?.target ?? null);
  return autofillPlanningQuarters(next, line, locked);
}
// Seed only empty editable annual counts; explicit values and manual clears remain untouched.
export function initializeNewLogoEstimates(content: PlanContent, locked: readonly string[] = []) {
  let next = content;
  for (const line of content.targets.filter(t => t.scope === "workspace" && t.metric === "new_logo" && t.period === `Y${content.year}` && t.target === null && !t.newLogoEstimate)) {
    const revenue = newLogoRevenue(content, line);
    const basis = revenue?.currency && defaultNewLogoEstimate(revenue.currency);
    if (basis) {
      try { next = updateNewLogoEstimate(next, line.key, basis, locked); }
      catch { /* Locked history may require a higher annual total; leave it for explicit review. */ }
    }
  }
  return next;
}
