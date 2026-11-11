import type { MarketDivisionRecord } from "../../domains/account/store";
import type { TerritoryRecord } from "../../domains/planning/store";

/** Geographic target scopes mirror configuration; departments never identify a region. */
export function salesRegionCode(divisionCode: string): string {
  return `AUTO-${divisionCode}`;
}

/** Keep the planning FK identity while using configuration's current name and order. */
export function salesRegionTerritories(
  divisions: readonly MarketDivisionRecord[],
  territories: readonly TerritoryRecord[],
): TerritoryRecord[] {
  const byCode = new Map(territories.map((t) => [t.territoryCode, t]));
  return divisions.flatMap((d) => {
    const t = byCode.get(salesRegionCode(d.code));
    return t?.status === "active" && t.divisionIds.length === 1 && t.divisionIds[0] === d.id
      ? [{ ...t, name: d.name }]
      : [];
  });
}
