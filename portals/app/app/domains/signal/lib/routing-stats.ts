// What 智能分配 counts when somebody asks it to run. Pure: the action reads,
// this counts, the panel renders.
//
// IT DOES NOT FEED A DASHBOARD ANY MORE. An earlier version also produced a
// disposition split and a region breakdown, for a header strip and a chart
// tab on the page; the owner removed both as over-design (2026-09-06), and
// what those fed went with them. What is left is what the panel actually
// reads.
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
  /** Why the blocked ones are blocked. Empty when nothing is blocked. */
  readonly byReason: readonly Bucket[];
  /** Heaviest first - the reason anyone opens this. */
  readonly byOwner: readonly OwnerLoad[];
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
  // The settled ones are the complement - total less pending less blocked -
  // and nothing reads them by name.
  const pending = placed.filter((r) => !settled(r));

  const byReason = tally(blocked.map((r) => r.unroutableReason!));

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
    byReason,
    byOwner,
    total: rows.length,
    pending: pending.length,
    blocked: blocked.length,
  };
}

function tally(keys: readonly string[]): Bucket[] {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.key.localeCompare(b.key)));
}
