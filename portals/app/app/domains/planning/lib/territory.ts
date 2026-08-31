// D2 territories - who carries which patch of the market.
//
// The table, the service-role grants, the column locks, the action and its
// FEATURE KEY all shipped in batch 1. What never shipped was the middle: there
// is no service verb, no port method and no surface, so `planning.territory` -
// one of the nineteen frozen keys, sold from the PRO tier up - unlocked a
// read of rows that nothing in the product could create.
//
// It compounds: `sales_target.scope_type = 'territory'` needs a territory_id,
// so a real workspace on PRO could never set a regional target either. Same
// shape as the floor nobody could sign off (ADR-019) - a loop that does not
// close - reached one layer earlier.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export const TERRITORY_STATUSES = ["active", "retired"] as const;
export type TerritoryStatus = (typeof TERRITORY_STATUSES)[number];

export interface TerritoryDraft {
  territoryCode: string;
  name: string;
  parentId: string | null;
  ownerSub: string | null;
  /**
   * The regions this territory covers (0017), and the reason lead routing can
   * exist at all. A territory has always known WHO covers it and never WHICH
   * GROUND - the demo made the hole plain, with territories named
   * EAST/NORTH/SOUTH and accounts carrying 华东/华北/华南, nothing joining them.
   *
   * Empty covers NOTHING, matching market_segment.criteria: a half-configured
   * territory must not become the router's answer for every lead.
   */
  regions: readonly string[];
  status: TerritoryStatus;
}

/** What the rule needs to know about the territories already on file. */
export interface KnownTerritory {
  readonly id: string;
  readonly territoryCode: string;
  readonly parentId: string | null;
}

/**
 * Validate a territory before it is written.
 *
 * `territory_code` is the ANCHOR - the DDL marks it immutable and the column
 * locks refuse UPDATE on it - so this is an upsert BY CODE, the same shape the
 * catalogue uses for products and solutions (ADR-017). Importing the same
 * regional structure twice updates rather than duplicating, which is how a
 * territory list actually arrives: as a spreadsheet, more than once.
 */
export function planTerritory(
  input: TerritoryDraft,
  existing: readonly KnownTerritory[] = [],
): RuleResult<TerritoryDraft> {
  const territoryCode = input.territoryCode.trim();
  const name = input.name.trim();

  if (!territoryCode) {
    return fail(violation("code_required", "a territory needs a code", "territoryCode"));
  }
  if (!name) {
    return fail(violation("name_required", "a territory needs a name", "name"));
  }
  if (!(TERRITORY_STATUSES as readonly string[]).includes(input.status)) {
    return fail(violation("unknown_status", `${String(input.status)} is not a territory status`, "status"));
  }

  const self = existing.find((t) => t.territoryCode === territoryCode) ?? null;

  if (input.parentId !== null) {
    const parent = existing.find((t) => t.id === input.parentId);
    if (!parent) {
      return fail(violation("parent_not_found", "the parent territory does not exist", "parentId"));
    }
    // A region that reports to itself, directly or through a chain, is a tree
    // with no root. Every reader of the hierarchy - roll-ups, the scope
    // selector, the org chart - would loop forever, and the FK cannot see it:
    // a cycle is legal to Postgres, it is only nonsense to us.
    if (self && reaches(existing, parent.id, self.id)) {
      return fail(
        violation("parent_cycle", "a territory cannot report to itself, directly or through a chain", "parentId"),
      );
    }
  }

  // THE REGION LIST IS VALIDATED HERE, and until 2026-08-31 it was validated
  // nowhere. `regions` arrived with 0017, `upsertTerritory` has always written
  // it, and the validator sat in signal/lib/routing.ts - another domain, which
  // this write path had no reason to import - so whatever a caller sent went
  // to the database as-is.
  const regions = planTerritoryRegions(input.regions ?? []);
  if (!regions.ok) return regions as RuleResult<TerritoryDraft>;

  return ok({ ...input, territoryCode, name, regions: regions.value });
}

/** Whether following parent links from `fromId` ever arrives at `targetId`. */
function reaches(all: readonly KnownTerritory[], fromId: string, targetId: string): boolean {
  const byId = new Map(all.map((t) => [t.id, t]));
  const seen = new Set<string>();
  let cursor: string | null = fromId;
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === targetId) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

/**
 * Refuse a region list that would silently cover nothing or match sloppily.
 *
 * MOVED HERE FROM signal/lib/routing.ts on 2026-08-31. A territory is D2's
 * object and this is where the rest of the row is planned; over in D5 it sat
 * beside a router that only READS territories, so the one path that writes
 * them could not naturally reach it. That is the whole reason it never had a
 * caller - it was correct code in the wrong domain.
 *
 * Trims, drops blanks, and de-duplicates rather than rejecting: a list pasted
 * from a spreadsheet arrives with stray whitespace and repeats, and refusing
 * it outright would teach people to clean data by hand before every save. A
 * name too long to be a region is a different matter - that is a paste of the
 * wrong column, and accepting it would put a sentence in the map.
 */
export function planTerritoryRegions(regions: readonly string[]): RuleResult<string[]> {
  const cleaned = [...new Set(regions.map((r) => r.trim()).filter(Boolean))];
  if (cleaned.some((r) => r.length > 64)) {
    return fail(violation("region_too_long", "a region name is at most 64 characters", "regions"));
  }
  return ok(cleaned);
}
