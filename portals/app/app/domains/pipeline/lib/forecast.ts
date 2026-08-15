// D6 forecasting (docs/20-specs/30-business-rules.md section 2).
//
// A forecast_snapshot is an IMMUTABLE point-in-time record. The DDL revokes
// UPDATE on the table entirely, so re-forecasting appends a row and never edits
// one. The reason is worth restating because it is the first thing anyone tries
// to "optimize" away: forecast accuracy is end-of-period actual measured against
// start-of-period forecast, and it is computable only if every historical
// snapshot still exists. Overwrite them and the single number management most
// wants can never be produced again, retroactively, for all of history.
//
// The other rule that shapes this file: forecast_category is DECOUPLED from
// stage. A rep at `negotiate` who is not willing to commit says `best_case`, and
// that disagreement is the actual content of a forecast review. Deriving the
// category from the stage would delete the judgement the process exists to
// capture.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { DEFAULT_CURRENCY, ratio, sumMoney, toMinor, type Money } from "../../shared/money";
import { isTerminal, type Stage } from "./stage";

export const FORECAST_CATEGORIES = ["pipeline", "best_case", "commit", "closed"] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];

export const SCOPE_TYPES = ["workspace", "territory", "owner"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export function isForecastCategory(v: string): v is ForecastCategory {
  return (FORECAST_CATEGORIES as readonly string[]).includes(v);
}

/** The scope a snapshot covers. Part of the snapshot's unique key. */
export interface ForecastScope {
  scopeType: ScopeType;
  territoryId: string | null;
  ownerSub: string | null;
}

export interface ForecastableOpportunity {
  id: string;
  stage: Stage;
  forecastCategory: ForecastCategory;
  amount: Money | null;
  territoryId: string | null;
  ownerSub: string | null;
}

export interface ForecastTotals {
  commitAmount: Money;
  bestCaseAmount: Money;
  pipelineAmount: Money;
  closedAmount: Money;
}

/**
 * Roll opportunities up into the four category totals.
 *
 * Each opportunity lands in exactly one bucket - the buckets do NOT nest. A
 * "best case" total that silently includes commit would double-count against a
 * commit total presented beside it; whether to add them is the reader's call,
 * made on the page, not hidden in the arithmetic.
 *
 * Amount-less opportunities contribute zero rather than being dropped, so the
 * count of rows behind a total always matches what is on screen.
 */
export function rollUp(
  opportunities: readonly ForecastableOpportunity[],
  currency: string = DEFAULT_CURRENCY,
): RuleResult<ForecastTotals> {
  const buckets: Record<ForecastCategory, Money[]> = {
    pipeline: [],
    best_case: [],
    commit: [],
    closed: [],
  };

  for (const o of opportunities) {
    if (!isForecastCategory(o.forecastCategory)) {
      return fail(
        violation(
          "unknown_forecast_category",
          `${o.id} has forecast category ${String(o.forecastCategory)}`,
          "forecastCategory",
        ),
      );
    }
    if (o.amount) buckets[o.forecastCategory].push(o.amount);
  }

  const commit = sumMoney(buckets.commit, currency);
  const best = sumMoney(buckets.best_case, currency);
  const pipe = sumMoney(buckets.pipeline, currency);
  const closed = sumMoney(buckets.closed, currency);
  for (const r of [commit, best, pipe, closed]) if (!r.ok) return r as RuleResult<ForecastTotals>;

  return ok({
    commitAmount: (commit as { ok: true; value: Money }).value,
    bestCaseAmount: (best as { ok: true; value: Money }).value,
    pipelineAmount: (pipe as { ok: true; value: Money }).value,
    closedAmount: (closed as { ok: true; value: Money }).value,
  });
}

/** Keep only the opportunities a scope covers. */
export function inScope(
  opportunities: readonly ForecastableOpportunity[],
  scope: ForecastScope,
): ForecastableOpportunity[] {
  if (scope.scopeType === "workspace") return [...opportunities];
  if (scope.scopeType === "territory") {
    return opportunities.filter((o) => o.territoryId === scope.territoryId);
  }
  return opportunities.filter((o) => o.ownerSub === scope.ownerSub);
}

export interface SnapshotRow extends ForecastTotals {
  period: string;
  scopeType: ScopeType;
  territoryId: string | null;
  ownerSub: string | null;
  currency: string;
  snapshotAt: Date;
}

/**
 * Build the append-only snapshot row.
 *
 * The unique key is (workspace, period, scope_type, territory_id, owner_sub,
 * snapshot_at): one snapshot per scope per instant. Two submissions in the same
 * millisecond collide, which is correct - they are the same snapshot.
 */
export function planSnapshot(input: {
  period: string;
  scope: ForecastScope;
  opportunities: readonly ForecastableOpportunity[];
  currency?: string;
  snapshotAt?: Date;
}): RuleResult<SnapshotRow> {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  if (!input.period.trim()) {
    return fail(violation("period_required", "a snapshot must name the period it forecasts", "period"));
  }
  const scopeCheck = validateScope(input.scope);
  if (!scopeCheck.ok) return scopeCheck as RuleResult<SnapshotRow>;

  const totals = rollUp(inScope(input.opportunities, input.scope), currency);
  if (!totals.ok) return totals as RuleResult<SnapshotRow>;

  return ok({
    ...totals.value,
    period: input.period.trim(),
    scopeType: input.scope.scopeType,
    territoryId: input.scope.territoryId,
    ownerSub: input.scope.ownerSub,
    currency,
    snapshotAt: input.snapshotAt ?? new Date(),
  });
}

/** A scope must carry exactly the key its type needs, and no other. */
export function validateScope(scope: ForecastScope): RuleResult<ForecastScope> {
  if (scope.scopeType === "workspace") {
    if (scope.territoryId != null || scope.ownerSub != null) {
      return fail(
        violation("scope_overspecified", "a workspace scope carries no territory and no owner", "scopeType"),
      );
    }
    return ok(scope);
  }
  if (scope.scopeType === "territory") {
    if (!scope.territoryId) {
      return fail(violation("scope_incomplete", "a territory scope needs a territory", "territoryId"));
    }
    if (scope.ownerSub != null) {
      return fail(violation("scope_overspecified", "a territory scope carries no owner", "ownerSub"));
    }
    return ok(scope);
  }
  if (scope.scopeType === "owner") {
    if (!scope.ownerSub) {
      return fail(violation("scope_incomplete", "an owner scope needs an owner", "ownerSub"));
    }
    if (scope.territoryId != null) {
      return fail(violation("scope_overspecified", "an owner scope carries no territory", "territoryId"));
    }
    return ok(scope);
  }
  return fail(violation("unknown_scope_type", `${String(scope.scopeType)} is not a scope type`, "scopeType"));
}

/**
 * Attainment = closed against target for the same scope and period.
 *
 * D2 sets the target and D6 computes the achievement; neither domain writes the
 * other's data. Returns null when no target was set, which is a different fact
 * from 0% attained - collapsing them makes an unset quota look like a missed one.
 */
export function attainment(closed: Money, target: Money): RuleResult<number | null> {
  return ratio(closed, target);
}

/**
 * Forecast accuracy: what a past snapshot predicted against what actually closed.
 * Computable only because snapshots are never overwritten.
 */
export function accuracy(
  snapshot: Pick<SnapshotRow, "commitAmount">,
  actualClosed: Money,
): RuleResult<number | null> {
  return ratio(actualClosed, snapshot.commitAmount);
}

/**
 * Changing an opportunity's forecast category. Deliberately permissive between
 * the three open categories - that judgement is the salesperson's job - but
 * `closed` is not a judgement: it states the deal is done, so it must agree with
 * a terminal stage, in both directions.
 */
export function planCategoryChange(
  current: { stage: Stage; forecastCategory: ForecastCategory },
  to: ForecastCategory,
): RuleResult<{ forecastCategory: ForecastCategory }> {
  if (!isForecastCategory(to)) {
    return fail(violation("unknown_forecast_category", `${String(to)} is not a forecast category`, "forecastCategory"));
  }
  if (to === "closed" && !isTerminal(current.stage)) {
    return fail(
      violation(
        "closed_requires_terminal_stage",
        `cannot forecast as closed while the opportunity is at ${current.stage}`,
        "forecastCategory",
      ),
    );
  }
  if (to !== "closed" && isTerminal(current.stage)) {
    return fail(
      violation(
        "terminal_requires_closed",
        `a ${current.stage} opportunity is closed and cannot forecast as ${to}`,
        "forecastCategory",
      ),
    );
  }
  return ok({ forecastCategory: to });
}

/** Total of the three open categories. Named so no caller has to guess whether
 * `closed` is inside it. */
export function openPipelineTotal(totals: ForecastTotals): RuleResult<Money> {
  return sumMoney([totals.commitAmount, totals.bestCaseAmount, totals.pipelineAmount], totals.commitAmount.currency);
}

/** True when a total is exactly zero, without floating-point ambiguity. */
export function isZero(m: Money): boolean {
  return toMinor(m.amount) === 0;
}
