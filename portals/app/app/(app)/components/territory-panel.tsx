"use client";

import { useMemberName } from "../lib/member-names";
import {
  DataTable,
  EmptyState,
  Section,
  TableTitleCell,
} from "@vxture/design-ui";
import { RowActions, useTableSort } from "./table-fittings";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

// Sales planning reads the territory roster; region management lives in configuration.

export interface TerritoryRow {
  readonly id: string;
  readonly territoryCode: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly ownerSub: string | null;
  readonly status: string;
  readonly regions: readonly string[];
  /** The units that work it (0052), by name; empty reads as 未挂单位. */
  readonly units: readonly string[];
}

/* 排序取值: what each sortable column ORDERS ON. Not always what the cell
   renders - a money cell sorts on the raw amount, not its formatted string. */
const SORT_ON = {
  name: (r: TerritoryRow) => r.name,
};

export function TerritoryPanel({
  rows,
  action,
  canConfigure = false,
}: {
  /** Region configuration visibility, gated independently from sales targets. */
  readonly canConfigure?: boolean;
  readonly rows: readonly TerritoryRow[];
  /** The panel's action, in the DS Section header slot - 新建区域 on /planning. */
  readonly action?: ReactNode;
}) {
  const { DATA_TABLE_LABELS, DS_LABELS, DOMAIN_LABEL, PLANNING_TEXT } = useMessages();
  const memberName = useMemberName();
  const sorted = useTableSort<TerritoryRow>([], SORT_ON);
  const router = useRouter();
  const nameOf = new Map(rows.map((r) => [r.id, r.name]));
  return (
    <Section id="territories" icon="map-pin" title={DOMAIN_LABEL.territory} action={action}>
      {rows.length === 0 ? (
        <EmptyState
          title={PLANNING_TEXT.territoryNone}
          description={PLANNING_TEXT.territoryNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: TerritoryRow) => r.id}
          rows={[...sorted.sortRows(rows)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
          indexStart={1}
          rowActions={
            canConfigure ? () => (
              <RowActions
                label={DS_LABELS.actionMenu}
                items={[{
                  id: "configure",
                  label: DOMAIN_LABEL.division,
                  icon: "settings",
                  onSelect: () => router.push("/admin/division"),
                }]}
              />
            ) : undefined
          }
          columns={[
            {
              /* 编码与名称合成首列 (owner: 首列全部走 TableTitleCell). They were
                 two columns with the CODE first, which put the row's identity
                 in second place and forced an `align:"left"` override to undo
                 the position-based default. As a title cell the name leads and
                 the code becomes its description - the same shape every other
                 first column in this product now has. */
              id: "name",
              header: PLANNING_TEXT.territoryName,
              sortable: true,
              cell: (r: TerritoryRow) => (
                <TableTitleCell title={r.name} description={r.territoryCode} tooltip={r.name} />
              ),
            },
            {
              // Routing uses these configured region names as coverage.
              id: "regions",
              header: PLANNING_TEXT.territoryRegions,
              cell: (r: TerritoryRow) => r.regions.join(" / "),
            },
            {
              /* 所属单位 (0052): the organisation's side of the joint, beside
                 the ground it covers. */
              id: "units",
              header: PLANNING_TEXT.territoryUnits,
              cell: (r: TerritoryRow) =>
                r.units.length === 0
                  ? <span className="text-muted-foreground text-body-small">{PLANNING_TEXT.territoryNoUnit}</span>
                  : r.units.join(" / "),
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
                memberName(r.ownerSub) ?? PLANNING_TEXT.territoryNoOwner,
            },
            {
              id: "status",
              header: PLANNING_TEXT.territoryStatus,
              cell: (r: TerritoryRow) =>
                r.status === "active" ? null : (
                  <Tag>
                    {PLANNING_TEXT.territoryRetired}
                  </Tag>
                ),
            },
          ]}
        />
      )}
    </Section>
  );
}
