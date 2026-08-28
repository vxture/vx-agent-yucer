// D2 sales planning (docs/20-specs/20-capability-domains.md, D2).
//
// D2 sets targets; D6 computes achievement. Neither domain writes the other's
// data, which is why attainment lives in pipeline/lib/forecast.ts and only the
// TARGET side lives here.
//
// The rule that shapes this file: a target's SCOPE TUPLE is its identity.
// (period, scope_type, territory_id, owner_sub, metric) is the unique key, and
// the column locks allow UPDATE only on plan_id, target_amount, currency and
// status. Editing a scope would silently move a commitment from one person or
// period to another while keeping its history - so changing scope means a new
// target, and the old one is closed.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { ratio, type Money } from "../../shared/money";
// A target carries a TargetValue, not a Money, and the whole point of
// TD-013 is that those are not the same type.

export const TARGET_METRICS = ["revenue", "new_logo", "pipeline", "margin"] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

/**
 * What a metric is counted in - a PURE FUNCTION of the metric, never stored.
 *
 * The database has no `unit` column on purpose. A stored unit is a second
 * source of truth that can disagree with the metric beside it, and there is
 * exactly one right answer per metric. See ADR-020: one table, unit derived.
 */
export type TargetUnit = "money" | "count";

export function unitOf(metric: TargetMetric): TargetUnit {
  // Ten new customers is not ten yuan, and it has no currency.
  return metric === "new_logo" ? "count" : "money";
}

/**
 * A target's number, carrying what it is a number OF.
 *
 * A discriminated union rather than `{amount, currency: string | null}`: the
 * point is that formatting a count as money must not compile. TD-013 existed
 * because `Money` was the only shape available, so a count silently acquired a
 * currency and the interface silently rendered it with a yuan sign.
 */
export type TargetValue =
  | { readonly unit: "money"; readonly amount: number; readonly currency: string }
  | { readonly unit: "count"; readonly amount: number };

export function targetValue(metric: TargetMetric, amount: number, currency: string): TargetValue {
  return unitOf(metric) === "count"
    ? { unit: "count", amount }
    : { unit: "money", amount, currency };
}

/** The currency to store, which is NULL for a count - see incr/0013's CHECK. */
export function currencyOf(value: TargetValue): string | null {
  return value.unit === "money" ? value.currency : null;
}

export const TARGET_STATUSES = ["draft", "committed", "closed"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export type TargetScopeType = "workspace" | "territory" | "owner";

export interface TargetScope {
  period: string;
  scopeType: TargetScopeType;
  territoryId: string | null;
  ownerSub: string | null;
  metric: TargetMetric;
}

export interface SalesTarget extends TargetScope {
  targetValue: TargetValue;
  status: TargetStatus;
  planId: string | null;
}

/** Canonical string form of the identity tuple, for dedup and comparison. */
export function scopeKey(scope: TargetScope): string {
  return [scope.period, scope.scopeType, scope.territoryId ?? "", scope.ownerSub ?? "", scope.metric].join(
    "|",
  );
}

export function validateTargetScope(scope: TargetScope): RuleResult<TargetScope> {
  if (!scope.period.trim()) {
    return fail(violation("period_required", "a target must name its period", "period"));
  }
  if (!(TARGET_METRICS as readonly string[]).includes(scope.metric)) {
    return fail(violation("unknown_metric", `${String(scope.metric)} is not a target metric`, "metric"));
  }
  if (scope.scopeType === "workspace" && (scope.territoryId || scope.ownerSub)) {
    return fail(violation("scope_overspecified", "a workspace target carries no territory or owner", "scopeType"));
  }
  if (scope.scopeType === "territory" && !scope.territoryId) {
    return fail(violation("scope_incomplete", "a territory target needs a territory", "territoryId"));
  }
  if (scope.scopeType === "owner" && !scope.ownerSub) {
    return fail(violation("scope_incomplete", "an owner target needs an owner", "ownerSub"));
  }
  return ok(scope);
}

export function planTargetCreation(input: {
  scope: TargetScope;
  targetValue: TargetValue;
  planId?: string | null;
  existing?: readonly TargetScope[];
}): RuleResult<SalesTarget> {
  const scope = validateTargetScope(input.scope);
  if (!scope.ok) return scope as RuleResult<SalesTarget>;

  if (!(input.targetValue.amount >= 0)) {
    return fail(violation("amount_negative", "a target cannot be negative", "targetValue"));
  }
  // The unit is derived from the metric, so a caller cannot hand in a money
  // value for a count metric. Checking it here rather than trusting the caller
  // is what keeps the DDL's CHECK from being the first thing that notices.
  if (input.targetValue.unit !== unitOf(input.scope.metric)) {
    return fail(
      violation(
        "unit_mismatch",
        `${input.scope.metric} is measured in ${unitOf(input.scope.metric)}`,
        "targetValue",
      ),
    );
  }
  // A count of customers is a whole number. Half a new logo is not a thing.
  if (input.targetValue.unit === "count" && !Number.isInteger(input.targetValue.amount)) {
    return fail(violation("count_not_integer", "a customer count must be a whole number", "targetValue"));
  }

  const key = scopeKey(input.scope);
  if ((input.existing ?? []).some((e) => scopeKey(e) === key)) {
    // The unique index would reject it anyway; saying so here names the reason.
    return fail(
      violation(
        "duplicate_scope",
        "a target already exists for this period, scope and metric; adjust that one rather than adding a second",
        "scopeType",
      ),
    );
  }

  return ok({
    ...input.scope,
    period: input.scope.period.trim(),
    targetValue: input.targetValue,
    status: "draft",
    planId: input.planId ?? null,
  });
}

export interface TargetPatch {
  targetValue?: TargetValue;
  status?: TargetStatus;
  planId?: string | null;
}

/**
 * Only the number and the state move.
 *
 * A closed target is frozen: it is the historical record of what was committed
 * for a finished period, and re-opening it to change the number is how a missed
 * quarter becomes a met one.
 */
export function planTargetUpdate(
  current: SalesTarget,
  patch: TargetPatch,
): RuleResult<TargetPatch> {
  if (current.status === "closed") {
    return fail(
      violation(
        "target_closed",
        "a closed target records what was committed for a finished period and cannot be edited",
        "status",
      ),
    );
  }
  if (patch.targetValue && !(patch.targetValue.amount >= 0)) {
    return fail(violation("amount_negative", "a target cannot be negative", "targetValue"));
  }
  if (patch.targetValue && patch.targetValue.unit !== current.targetValue.unit) {
    return fail(
      violation("unit_mismatch", "a target's unit follows its metric and cannot be edited", "targetValue"),
    );
  }
  if (
    patch.targetValue?.unit === "money" &&
    current.targetValue.unit === "money" &&
    patch.targetValue.currency !== current.targetValue.currency
  ) {
    return fail(
      violation(
        "currency_mismatch",
        "changing a target's currency changes what was committed; close it and set a new one",
        "currency",
      ),
    );
  }
  if (patch.targetValue?.unit === "count" && !Number.isInteger(patch.targetValue.amount)) {
    return fail(violation("count_not_integer", "a customer count must be a whole number", "targetValue"));
  }
  if (patch.status && !(TARGET_STATUSES as readonly string[]).includes(patch.status)) {
    return fail(violation("unknown_status", `${String(patch.status)} is not a target status`, "status"));
  }
  // draft -> committed -> closed only moves forward: uncommitting a number
  // someone already reported upward is the same problem as editing a closed one.
  if (patch.status && TARGET_STATUSES.indexOf(patch.status) < TARGET_STATUSES.indexOf(current.status)) {
    return fail(
      violation("status_regression", `a target cannot go from ${current.status} back to ${patch.status}`, "status"),
    );
  }
  return ok(patch);
}

const SCOPE_KEYS = ["period", "scopeType", "scope_type", "territoryId", "territory_id", "ownerSub", "owner_sub", "metric"] as const;

/** Guard: the identity tuple is not writable. */
export function assertScopeUnchanged(patch: Record<string, unknown>): RuleResult<true> {
  const found = SCOPE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(patch, k));
  if (found.length === 0) return ok(true);
  return {
    ok: false,
    violations: found.map((k) =>
      violation(
        "scope_immutable",
        `sales_target.${k} is part of the target's identity; a different scope is a different target`,
        k,
      ),
    ),
  };
}

// --- Measuring a target (TD-013, ADR-020) ------------------------------------
//
// WHY THIS LIVES IN D2 AND NOT D6. The old `attainment(closed, target)` sat in
// pipeline/lib/forecast.ts, and it took the closed amount because that was the
// only numerator anyone had thought about. That is exactly how `metric` came to
// be ignored: the caller picked the numerator, every caller picked the same
// one, and three of the four metrics were measured against a number that had
// nothing to do with them.
//
// The split that holds: D6 PUBLISHES THE NUMBERS (the snapshot's four totals
// and the new-logo count), D2 DECIDES WHICH ONE ITS METRIC IS MEASURED AGAINST.
// Neither writes the other's data, which is the rule that mattered all along.

/** Why a target could not be measured. A code, not a sentence - see TD-010. */
export type MeasurementGap =
  /** No forecast snapshot exists for this scope and period. */
  | "no_snapshot"
  /** The product holds no cost data, so margin cannot be computed at all. */
  | "no_cost_data"
  /** The snapshot predates incr/0013, or its period label could not be parsed. */
  | "not_counted";

export type Measurement =
  | { readonly kind: "measured"; readonly achieved: TargetValue; readonly ratio: number | null }
  | { readonly kind: "not_measurable"; readonly code: MeasurementGap };

/** The published numbers a measurement reads. Structural, so D2 does not
 *  import D6's row type and create a cycle. */
export interface PublishedTotals {
  readonly closedAmount: Money;
  readonly pipelineAmount: Money;
  readonly newLogoCount: number | null;
}

/**
 * What a target has achieved, and how far along it is.
 *
 * Returns `not_measurable` rather than a number whenever the numerator does not
 * exist. Before this, `margin` was measured against closed revenue and
 * `new_logo` against closed revenue too - a target of 10 new customers against
 * 2,700,000 closed rendered as 27,000,000% attained. A wrong number presented
 * as a percentage is worse than an honest blank, because only the blank tells
 * the reader not to act on it.
 */
export function measure(target: SalesTarget, totals: PublishedTotals | null): Measurement {
  if (!totals) return { kind: "not_measurable", code: "no_snapshot" };

  if (target.metric === "margin") {
    // Not a gap in this function - a gap in the model. Nothing in this product
    // records cost, so gross margin has no inputs. Saying so is the only
    // honest answer available until it does.
    return { kind: "not_measurable", code: "no_cost_data" };
  }

  if (target.metric === "new_logo") {
    if (totals.newLogoCount === null) return { kind: "not_measurable", code: "not_counted" };
    if (target.targetValue.unit !== "count") return { kind: "not_measurable", code: "not_counted" };
    const achieved: TargetValue = { unit: "count", amount: totals.newLogoCount };
    const t = target.targetValue.amount;
    return { kind: "measured", achieved, ratio: t === 0 ? null : totals.newLogoCount / t };
  }

  // revenue is measured against what closed; pipeline against what is IN the
  // pipeline. Using the closed amount for both - which is what happened before
  // this function existed - measures a pipeline-building target by how much of
  // it has already stopped being pipeline.
  const source = target.metric === "pipeline" ? totals.pipelineAmount : totals.closedAmount;
  if (target.targetValue.unit !== "money") return { kind: "not_measurable", code: "not_counted" };
  const r = ratio(source, {
    amount: target.targetValue.amount,
    currency: target.targetValue.currency,
  });
  if (!r.ok) return { kind: "not_measurable", code: "no_snapshot" };
  return {
    kind: "measured",
    achieved: { unit: "money", amount: source.amount, currency: source.currency },
    ratio: r.value,
  };
}

/**
 * The target a money-shaped summary should measure: the committed workspace one
 * FOR A MONEY METRIC.
 *
 * A rule, not a page detail, and it is here because it was written twice as an
 * inline `.find()` - on the board's quota card and on the planning page's lead
 * line - and both took the first committed workspace target regardless of
 * metric. Both then formatted it as money and divided a pipeline by it. Today's
 * row ordering happens to put revenue first, so the defect is latent rather
 * than live; close the revenue target and it is neither.
 *
 * Returns null rather than falling back to a count target. A summary with no
 * money target to quote should say nothing, not quote the wrong number.
 */
export function summaryTarget<T extends { scopeType: TargetScopeType; status: TargetStatus; metric: TargetMetric }>(
  targets: readonly T[],
): T | null {
  return (
    targets.find(
      (t) => t.scopeType === "workspace" && t.status === "committed" && unitOf(t.metric) === "money",
    ) ?? null
  );
}
