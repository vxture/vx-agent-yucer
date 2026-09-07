// 分配分析 - the numbers the routing page opens with, built to the shape
// collections and delivery settled on (owner, 2026-09-06: 统计为主，列表为具体
// 清单). Pure: the page reads, this counts, the section renders.
//
// THE PRIMARY CUT IS WHAT NEEDS DOING, not what the rule decided. A router's
// list is read to answer one question - "how much of this is waiting on me" -
// and three dispositions answer it exhaustively: already where it belongs,
// waiting to be moved, or impossible to place at all.
//
// THE THIRD ONE IS NOT A FAILURE OF THE ROUTER. An unroutable lead means the
// TERRITORY MAP has a hole in it, and the three reasons are three different
// people's jobs: a missing region is the account record, an uncovered region
// is the map, an ownerless territory is a staffing decision. Rolled into one
// "12 unroutable" they look like one problem and get one shrug; split out,
// each names who fixes it.
//
// LOAD IS THE OTHER HALF OF THE RULE and it has no other reading. Territory
// decides who MAY work a lead and load decides which of them SHOULD, so a page
// that shows the decisions without showing the load has hidden the tiebreaker
// - and "why did this go to me and not to them" is unanswerable without it.

export interface RoutingStatRow {
  readonly currentOwner: string | null;
  readonly suggestedOwner: string | null;
  readonly unroutableReason: string | null;
  readonly region: string | null;
}

export interface Bucket {
  readonly key: string;
  readonly count: number;
}

/** What one person holds now, and what they would hold if the page were applied. */
export interface OwnerLoad {
  readonly sub: string;
  readonly now: number;
  readonly after: number;
}

export interface RoutingStats {
  /** settled / pending / blocked, always in that order and always all three. */
  readonly byDisposition: readonly Bucket[];
  /** Why the blocked ones are blocked. Empty when nothing is blocked. */
  readonly byReason: readonly Bucket[];
  /** Heaviest first - the reason anyone opens this. */
  readonly byOwner: readonly OwnerLoad[];
  readonly byRegion: readonly Bucket[];
  readonly total: number;
  /** How many rows the apply button would actually change. */
  readonly pending: number;
  readonly blocked: number;
}

/** A lead already sitting with the person the rule would choose. */
function settled(r: RoutingStatRow): boolean {
  return r.unroutableReason === null && r.suggestedOwner === r.currentOwner;
}

export function routingStats(rows: readonly RoutingStatRow[]): RoutingStats {
  const blocked = rows.filter((r) => r.unroutableReason !== null);
  const placed = rows.filter((r) => r.unroutableReason === null);
  const atRest = placed.filter(settled);
  const pending = placed.filter((r) => !settled(r));

  // ALWAYS ALL THREE CELLS, including the zeros. The header strip is read as a
  // shape rather than as a list, and a strip that drops "blocked" when it is
  // empty changes width between visits - the reader then cannot tell "none
  // blocked" from "that cell moved". Delivery drops empty stages because its
  // stages are a lifecycle a project travels; these three are one partition of
  // the same set, every time.
  const byDisposition: Bucket[] = [
    { key: "settled", count: atRest.length },
    { key: "pending", count: pending.length },
    { key: "blocked", count: blocked.length },
  ];

  const byReason = tally(blocked.map((r) => r.unroutableReason!));

  // THE REGION IS THE ROUTER'S OWN INPUT, so a lead without one is not "other"
  // - it is the case the map cannot see, and it keeps its own named bucket.
  const byRegion = tally(rows.map((r) => r.region ?? UNKNOWN_REGION));

  // NOW AND AFTER, side by side. `now` is what the rule itself read as load;
  // `after` is what applying every suggestion on this page would produce. The
  // gap is the page's effect, and a page proposing to move work has to show
  // whether it evens the load or tips it.
  const loads = new Map<string, { now: number; after: number }>();
  const bump = (sub: string, field: "now" | "after") => {
    const held = loads.get(sub) ?? { now: 0, after: 0 };
    held[field] += 1;
    loads.set(sub, held);
  };
  for (const r of rows) {
    if (r.currentOwner) bump(r.currentOwner, "now");
    // A BLOCKED LEAD DOES NOT MOVE, so it counts against whoever holds it in
    // both columns. Dropping it from `after` would show the map's holes as
    // somebody's workload falling.
    const lands = r.unroutableReason === null ? r.suggestedOwner : r.currentOwner;
    if (lands) bump(lands, "after");
  }

  const byOwner = [...loads.entries()]
    .map(([sub, l]) => ({ sub, now: l.now, after: l.after }))
    // Heaviest AFTER first: this table is read to check the outcome, not the
    // starting point. Ties break on the subject so two runs agree.
    .sort((a, b) => (b.after !== a.after ? b.after - a.after : a.sub.localeCompare(b.sub)));

  return {
    byDisposition,
    byReason,
    byOwner,
    byRegion,
    total: rows.length,
    pending: pending.length,
    blocked: blocked.length,
  };
}

/** The bucket a lead with no region falls in - named, not blank. */
export const UNKNOWN_REGION = "__none__";

function tally(keys: readonly string[]): Bucket[] {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.key.localeCompare(b.key)));
}
