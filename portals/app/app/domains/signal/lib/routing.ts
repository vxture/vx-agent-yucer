import { fail, ok, violation, type RuleResult } from "../../shared/result";

// Who a lead goes to.
//
// The owner's rule, 2026-08-30: TERRITORY FIRST, THEN LOAD. The two halves
// answer different questions and the order matters - territory decides who is
// ALLOWED to work it, load decides which of them SHOULD.
//
//   1. The lead's account carries a region; a territory names the regions it
//      covers; the covering territory's owner takes the lead.
//   2. When that leaves more than one candidate - several territories cover
//      the region, or the territory has no owner and the fallback pool is
//      used - the one carrying the fewest open leads takes it.
//
// WHY LOAD IS SECOND AND NOT FIRST. Load alone spreads work evenly and sends
// it to people who do not cover the ground: a rep who has never worked 华南
// getting a 华南 lead because they happened to be idle is worse than a slower
// queue in the right hands. Territory alone piles everything on one owner.
// Ordered, each does the job the other cannot.
//
// UNROUTABLE IS AN OUTCOME, NOT AN ERROR. A lead with no account, an account
// with no region, or a region no territory covers all end here, and the lead
// keeps whatever owner it had. Assigning it to somebody so the queue looks
// tidy would put work in hands nobody chose, and hide the fact that the
// territory map has a hole in it.

export interface RoutableLead {
  id: string;
  /** Null when the lead has not been matched to an account yet. */
  region: string | null;
}

export interface RoutingTerritory {
  id: string;
  name: string;
  ownerSub: string | null;
  /** The regions this territory covers. Empty covers NOTHING - see 0017. */
  regions: readonly string[];
  status: string;
}

export type RoutingOutcome =
  | { readonly kind: "assigned"; readonly ownerSub: string; readonly territoryId: string; readonly basis: string }
  | { readonly kind: "unroutable"; readonly reason: "no_region" | "no_territory" | "no_owner" };

/** Territories that cover a region, retired ones excluded. */
export function coveringTerritories(
  region: string,
  territories: readonly RoutingTerritory[],
): RoutingTerritory[] {
  return territories.filter(
    // `regions ?? []` rather than trusting the field. A territory row written
    // before 0017 has no regions at all, and a router that throws on one is a
    // router that stops working the moment it meets real historical data.
    // Absent reads as covering NOTHING, which is the same answer an empty list
    // gives and the safe one here.
    (t) => t.status === "active" && (t.regions ?? []).includes(region),
  );
}

/**
 * Route one lead.
 *
 * `openLeadsBySub` is the load: how many leads each candidate already holds
 * that nobody has closed. Passed in rather than read here so the rule stays a
 * pure function - the same reason every other rule in this repo takes its
 * facts as arguments.
 */
export function routeLead(
  lead: RoutableLead,
  territories: readonly RoutingTerritory[],
  openLeadsBySub: ReadonlyMap<string, number>,
): RoutingOutcome {
  if (!lead.region) return { kind: "unroutable", reason: "no_region" };

  const covering = coveringTerritories(lead.region, territories);
  if (covering.length === 0) return { kind: "unroutable", reason: "no_territory" };

  const owned = covering.filter((t) => t.ownerSub !== null);
  if (owned.length === 0) return { kind: "unroutable", reason: "no_owner" };

  // ONE COVERING TERRITORY IS THE COMMON CASE and load never enters it: the
  // ground has one owner, so there is nothing to balance. Saying so plainly in
  // the basis matters - "why did this go to me" is the question this rule will
  // actually be asked.
  if (owned.length === 1) {
    const t = owned[0];
    return {
      kind: "assigned",
      ownerSub: t.ownerSub!,
      territoryId: t.id,
      basis: `region ${lead.region} is covered by ${t.name}`,
    };
  }

  // Several owners cover it. Fewest open leads wins; ties break on the
  // territory name so the same inputs always give the same answer - a router
  // that assigns differently on two identical runs cannot be argued with.
  const ranked = [...owned].sort((a, b) => {
    const la = openLeadsBySub.get(a.ownerSub!) ?? 0;
    const lb = openLeadsBySub.get(b.ownerSub!) ?? 0;
    return la !== lb ? la - lb : a.name.localeCompare(b.name);
  });
  const winner = ranked[0];
  return {
    kind: "assigned",
    ownerSub: winner.ownerSub!,
    territoryId: winner.id,
    basis: `region ${lead.region} has ${owned.length} owners; ${winner.name} carries the fewest open leads (${openLeadsBySub.get(winner.ownerSub!) ?? 0})`,
  };
}

// `planTerritoryRegions` USED TO LIVE HERE, and that is why nothing ever
// called it. A territory is D2's object; this file is D5's router, which only
// READS territories. The write path is `upsertTerritory` in planning, and from
// there the validator was in another domain - so the region list went to the
// database unchecked from 0017 until 2026-08-31. It now lives in
// planning/lib/territory.ts, next to the rule that plans the rest of the row.
