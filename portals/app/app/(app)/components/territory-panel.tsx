"use client";

import { DataTable, EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// The territory roster: who carries which patch of the market.
//
// This module was `planned` in the launcher while its FEATURE KEY was already
// being sold. `planning.territory` is one of the nineteen frozen keys, offered
// from the PRO tier up, and the only half of it that existed was the read - so
// a paying workspace could look at territories that nothing in the product
// could create. A territory-scoped target needs a territory_id, so regional
// targets were unreachable too.
//
// A SECTION ON /planning, not a route of its own. A section inherits its host's
// nav entry and the host here is /planning, which IS one - the same test that
// keeps 战略客户 planned, since its only host would be a detail page.
//
// DISPLAY ONLY since 2026-09-05: creating and editing left for /territory/new
// (owner ruling), which also carries the regions field this panel never had.

export interface TerritoryRow {
  readonly id: string;
  readonly territoryCode: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly ownerSub: string | null;
  readonly status: string;
  readonly regions: readonly string[];
}

export function TerritoryPanel({ rows }: { readonly rows: readonly TerritoryRow[] }) {
  const { DATA_TABLE_LABELS, PLANNING_TEXT } = useMessages();
  const nameOf = new Map(rows.map((r) => [r.id, r.name]));
  return (
    <Section id="territories" icon="map-pin">
      {rows.length === 0 ? (
        <EmptyState
          title={PLANNING_TEXT.territoryNone}
          description={PLANNING_TEXT.territoryNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: TerritoryRow) => r.id}
          rows={[...rows]}
          columns={[
            {
              id: "code",
              header: PLANNING_TEXT.territoryCode,
              cell: (r: TerritoryRow) => r.territoryCode,
            },
            {
              id: "name",
              header: PLANNING_TEXT.territoryName,
              cell: (r: TerritoryRow) => r.name,
            },
            {
              // The regions column joined with the /territory/new page: the
              // list is what routing matches against, so a blank here is the
              // "dead ground" the form's assistant warns about.
              id: "regions",
              header: PLANNING_TEXT.territoryRegions,
              cell: (r: TerritoryRow) => r.regions.join(" / "),
            },
            {
              id: "parent",
              header: PLANNING_TEXT.territoryParent,
              // Blank, not "-", for a top-level region: most rows are top level
              // and a column of dashes reads as missing data rather than as the
              // ordinary case.
              cell: (r: TerritoryRow) =>
                r.parentId ? (nameOf.get(r.parentId) ?? r.parentId) : "",
            },
            {
              id: "owner",
              header: PLANNING_TEXT.territoryOwner,
              cell: (r: TerritoryRow) =>
                r.ownerSub ?? PLANNING_TEXT.territoryNoOwner,
            },
            {
              id: "status",
              header: PLANNING_TEXT.territoryStatus,
              align: "center" as const,
              cell: (r: TerritoryRow) =>
                r.status === "active" ? null : (
                  <StatusBadge tone="neutral">
                    {PLANNING_TEXT.territoryRetired}
                  </StatusBadge>
                ),
            },
          ]}
        />
      )}
    </Section>
  );
}
