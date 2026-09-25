import type { ForecastCategory } from "./forecast";

// 声明变更日志 (incr/0084, YC-065 R2) - the pure half.
//
// A deal's amount, currency, close date, category and win rate are CLAIMS
// about the future. The store writes a row per changed claim in the same
// transaction as the change; this file decides what counts as a change and
// how a value is written down, so the in-memory and Prisma adapters cannot
// disagree about either.

export const CLAIM_FIELDS = ["amount", "currency", "expected_close_at", "forecast_category", "probability"] as const;
export type ClaimField = (typeof CLAIM_FIELDS)[number];

export const CLAIM_SOURCES = ["manual", "stage_machine", "proposal", "lines"] as const;
export type ClaimSource = (typeof CLAIM_SOURCES)[number];

/** Who and why for one write - handed to the store with the patch. */
export interface ClaimContext {
  readonly source: ClaimSource;
  /** null = the system (the stage machine, a line recompute). */
  readonly actorSub: string | null;
  readonly reason?: string | null;
  readonly occurredAt: Date;
}

export interface ClaimEvent {
  readonly field: ClaimField;
  readonly fromValue: string | null;
  readonly toValue: string | null;
  readonly source: ClaimSource;
  readonly reason: string | null;
  readonly actorSub: string | null;
  readonly occurredAt: Date;
}

export interface ClaimEventRecord extends ClaimEvent {
  readonly id: string;
  readonly opportunityId: string;
}

/** The claimed values of a deal, as the log compares them. */
export interface ClaimState {
  readonly amount: number | null;
  readonly currency: string;
  readonly expectedCloseAt: Date | null;
  readonly forecastCategory: string;
  readonly probability: number | null;
}

const text = {
  amount: (v: number | null) => (v === null ? null : v.toFixed(2)),
  date: (v: Date | null) => (v === null ? null : v.toISOString().slice(0, 10)),
  int: (v: number | null) => (v === null ? null : String(Math.round(v))),
};

/** One row per claim that actually changed - an unchanged value writes nothing. */
export function diffClaims(before: ClaimState, after: ClaimState, ctx: ClaimContext): ClaimEvent[] {
  const pairs: Array<[ClaimField, string | null, string | null]> = [
    ["amount", text.amount(before.amount), text.amount(after.amount)],
    ["currency", before.currency, after.currency],
    ["expected_close_at", text.date(before.expectedCloseAt), text.date(after.expectedCloseAt)],
    ["forecast_category", before.forecastCategory, after.forecastCategory],
    ["probability", text.int(before.probability), text.int(after.probability)],
  ];
  const reason = ctx.reason?.trim() || null;
  return pairs
    .filter(([, from, to]) => from !== to)
    .map(([field, fromValue, toValue]) => ({
      field,
      fromValue,
      toValue,
      source: ctx.source,
      reason,
      actorSub: ctx.actorSub,
      occurredAt: ctx.occurredAt,
    }));
}

// --- Slippage (YC-065 R2) -------------------------------------------------------

export interface Slippage {
  /** Times the close date was moved LATER. Earlier is not slippage. */
  readonly pushes: number;
  /** Days added across those pushes. */
  readonly pushedDays: number;
  /** A push that moved the date into a later quarter. */
  readonly crossedQuarter: boolean;
  /** Times a date was cleared - counted apart, it is not a push. */
  readonly datesLost: number;
}

const DAY = 86_400_000;
const quarterOf = (d: Date) => d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);

export function slippageOf(events: readonly Pick<ClaimEvent, "field" | "fromValue" | "toValue">[]): Slippage {
  let pushes = 0;
  let pushedDays = 0;
  let crossedQuarter = false;
  let datesLost = 0;
  for (const e of events) {
    if (e.field !== "expected_close_at" || e.fromValue === null) continue;
    if (e.toValue === null) {
      datesLost += 1;
      continue;
    }
    const from = new Date(`${e.fromValue}T00:00:00Z`);
    const to = new Date(`${e.toValue}T00:00:00Z`);
    if (to.getTime() <= from.getTime()) continue;
    pushes += 1;
    pushedDays += Math.round((to.getTime() - from.getTime()) / DAY);
    if (quarterOf(to) > quarterOf(from)) crossedQuarter = true;
  }
  return { pushes, pushedDays, crossedQuarter, datesLost };
}

// --- 偏离规则须理由 (YC-065 R9) ----------------------------------------------------

const OPTIMISM: Readonly<Record<string, number>> = { pipeline: 0, best_case: 1, commit: 2 };

/**
 * Is `next` more optimistic than what the rule suggests? Only then does the
 * change need a reason - more conservative, or agreeing with the rule, does
 * not. `closed` sits outside the ladder (the stage machine owns it).
 */
export function moreOptimisticThanRule(next: ForecastCategory, suggested: ForecastCategory | null): boolean {
  if (suggested === null) return false;
  const n = OPTIMISM[next];
  const s = OPTIMISM[suggested];
  return n !== undefined && s !== undefined && n > s;
}
