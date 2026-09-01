import type { ForecastScope } from "../../domains/pipeline/lib/forecast";

// Which slice of the pipeline a snapshot and its scorecard are about.
//
// The owner's ruling of 2026-09-01: territory and owner scopes should be
// allowed. The DOMAIN has supported all three since batch 1 - `inScope`,
// `validateScope`, `countNewLogos` and the DDL's NULLS NOT DISTINCT unique key
// were all written for them - and only the surface hardcoded workspace, with a
// comment saying the pickers did not exist yet. This is those pickers.
//
// ONE STRING IN THE URL, because a forecast is a thing people send each other.
// The period tab already writes `?period=`; a scorecard for one territory has
// to survive being pasted into a message the same way, and the alternative -
// three separate params that can disagree - would let `?scope=workspace` sit
// beside a stale `?owner=` and leave the reader guessing which won.
//
// The forms are `workspace`, `territory:<id>` and `owner:<sub>`.

export const SCOPE_WORKSPACE = "workspace";

/**
 * Parse the URL form, refusing anything that is not one of the three.
 *
 * A HAND-EDITED PARAM IS NOT A QUERY FRAGMENT. This mirrors resolvePeriod: the
 * value reaches a store filter, so an unrecognised string falls back to
 * workspace rather than travelling onward. The ids themselves are not validated
 * here - a territory that does not exist yields an empty scope, which reads as
 * a snapshot of nothing and is the truthful answer to asking about it.
 */
export function parseForecastScope(raw: string | undefined): ForecastScope {
  const v = (raw ?? "").trim();
  if (v.startsWith("territory:")) {
    const id = v.slice("territory:".length);
    if (id) return { scopeType: "territory", territoryId: id, ownerSub: null };
  }
  if (v.startsWith("owner:")) {
    const sub = v.slice("owner:".length);
    if (sub) return { scopeType: "owner", territoryId: null, ownerSub: sub };
  }
  return { scopeType: "workspace", territoryId: null, ownerSub: null };
}

/** The inverse, for building the option values a picker offers. */
export function forecastScopeKey(scope: ForecastScope): string {
  if (scope.scopeType === "territory") return `territory:${scope.territoryId ?? ""}`;
  if (scope.scopeType === "owner") return `owner:${scope.ownerSub ?? ""}`;
  return SCOPE_WORKSPACE;
}
