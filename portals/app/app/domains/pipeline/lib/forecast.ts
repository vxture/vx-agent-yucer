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
import { periodRange, within } from "../../shared/period";

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
  /**
   * Needed because `closed` cannot distinguish won from lost on its own.
   *
   * The category enum has four values and none of them is "lost", so a lost
   * deal is filed under `closed` too - and the won total counted it. Status is
   * the only thing that separates them.
   */
  status?: string;
  forecastCategory: ForecastCategory;
  amount: Money | null;
  territoryId: string | null;
  ownerSub: string | null;
  /** Which customer this is for. Needed to tell a NEW one from a repeat. */
  accountId?: string | null;
  /** When it was won. Places a closed deal in the period it landed in. */
  closedAt?: Date | null;
  /** When it is expected to close. Places an OPEN deal in a period. */
  expectedCloseAt?: Date | null;
}

export interface ForecastTotals {
  commitAmount: Money;
  bestCaseAmount: Money;
  pipelineAmount: Money;
  closedAmount: Money;
  /**
   * Customers won for the FIRST time inside this period, or null when nobody
   * counted - a snapshot from before incr/0013, or one whose period label this
   * product cannot parse into dates. Null is not zero; see periodRange.
   */
  newLogoCount: number | null;
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
    // A LOST deal contributes to nothing. It carries `closed` because the
    // category has no other terminal value, and counting it as won reported
    // money that was never won - which is the one direction a forecast must
    // never be wrong in. Business rules section 2: closed means WON.
    if (o.status === "lost") continue;
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
    // rollUp sees only the in-scope slice, and "first ever" is a workspace-wide
    // question. planSnapshot computes it from the unfiltered list and overwrites
    // this; leaving it null here means a caller who rolls up directly gets
    // "nobody counted" rather than a wrong count.
    newLogoCount: null,
  });
}

/**
 * Customers won for the first time inside a period.
 *
 * DEFINITION, and both halves of it matter:
 *
 *   * FIRST EVER, decided across the whole workspace - not the first win in
 *     this territory. Otherwise winning the same customer in two regions makes
 *     them a new logo twice, and the company's new-customer count exceeds the
 *     number of customers it actually acquired.
 *   * ATTRIBUTED TO THE SCOPE OF THAT FIRST DEAL. The credit follows the deal
 *     that broke the account, which is the deal the target was set against.
 *
 * Takes the UNFILTERED opportunity list plus the scope, rather than a filtered
 * one, because the first condition cannot be evaluated on a filtered list.
 *
 * Returns null when the period label cannot be parsed - see periodRange. A
 * count needs a range, and inventing one would report a number nobody can
 * reproduce.
 */
export function countNewLogos(
  all: readonly ForecastableOpportunity[],
  period: string,
  scope: ForecastScope,
): number | null {
  const range = periodRange(period);
  if (!range) return null;

  // Each account's earliest win, over everything the workspace has ever won.
  const firstWin = new Map<string, ForecastableOpportunity>();
  for (const o of all) {
    if (o.status !== "won" || !o.closedAt || !o.accountId) continue;
    const held = firstWin.get(o.accountId);
    if (!held || o.closedAt.getTime() < held.closedAt!.getTime()) firstWin.set(o.accountId, o);
  }

  let count = 0;
  for (const o of firstWin.values()) {
    if (!within(range, o.closedAt ?? null)) continue;
    if (inScope([o], scope).length === 1) count += 1;
  }
  return count;
}

/**
 * Keep only the opportunities a PERIOD covers. The sibling of `inScope`, and
 * the fix for TD-014.
 *
 * A forecast is always for a period - `forecast_snapshot` has carried a
 * `period` column since the baseline - but nothing ever filtered by it. A
 * 2026Q3 snapshot's `closed_amount` was every deal the workspace had ever won,
 * and its pipeline included deals expected to land in Q4. The board said
 * "this quarter's commit" over a number that was not a quarter's anything, and
 * the pipeline page grew a period selector that moved the trajectory beneath
 * tiles it did not move.
 *
 * TWO DATES, because "which period is this deal in" has two different answers
 * depending on whether it has happened yet:
 *
 *   * a WON deal belongs to the period it CLOSED in - that is a fact;
 *   * an OPEN deal belongs to the period it is EXPECTED to close in - that is
 *     a forecast, and it is the whole content of one.
 *
 * A LOST deal belongs to no period here. rollUp already contributes nothing for
 * it, and keeping it would only make the excluded count misleading.
 *
 * AN UNDATED OPEN DEAL BELONGS TO NO PERIOD EITHER, and this is the one
 * judgement in the function: you cannot commit to a quarter a deal you have not
 * dated. It is excluded rather than defaulted into the current period, and
 * `undated` reports how many so a surface can say so out loud instead of
 * quietly reporting less money than the list behind it shows.
 *
 * Returns null for a period label `periodRange` cannot parse. A caller that
 * cannot bound its period must not pretend to have filtered.
 */
export function inPeriod(
  opportunities: readonly ForecastableOpportunity[],
  period: string,
): { kept: ForecastableOpportunity[]; undated: number } | null {
  const range = periodRange(period);
  if (!range) return null;

  const kept: ForecastableOpportunity[] = [];
  let undated = 0;
  for (const o of opportunities) {
    if (o.status === "lost") continue;
    const closed = o.forecastCategory === "closed";
    const at = closed ? (o.closedAt ?? null) : (o.expectedCloseAt ?? null);
    if (!at) {
      undated += 1;
      continue;
    }
    if (within(range, at)) kept.push(o);
  }
  return { kept, undated };
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
  /**
   * Open deals in this scope with no expected close date, excluded from every
   * total above. Not persisted - it describes the INPUT to a snapshot, not the
   * snapshot, and a reader needs it at the moment they are being shown a total
   * that is smaller than the list behind it.
   */
  undated?: number;
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

  // SCOPE THEN PERIOD. Both filters, in either order, produce the same set -
  // but doing period second lets `undated` count only the deals this scope
  // actually owns, which is the number the reader can act on.
  const scoped = inScope(input.opportunities, input.scope);
  const period = inPeriod(scoped, input.period);
  if (!period) {
    // A snapshot names a period; one this product cannot turn into dates cannot
    // be filtered, and an unfiltered snapshot is the whole of TD-014. Refusing
    // is the honest answer - naming the forms it accepts is what makes the
    // refusal actionable.
    return fail(
      violation(
        "period_unparsed",
        `${input.period} is not a period this product can bound - use 2026Q3, 2026-07, 2026 or Y2026`,
        "period",
      ),
    );
  }

  const totals = rollUp(period.kept, currency);
  if (!totals.ok) return totals as RuleResult<SnapshotRow>;

  return ok({
    ...totals.value,
    undated: period.undated,
    newLogoCount: countNewLogos(input.opportunities, input.period, input.scope),
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
