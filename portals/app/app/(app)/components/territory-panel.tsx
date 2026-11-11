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
import { Tag } from "./tag";
import type { MarketMember } from "../../domains/shared/market-division";
import type { ReactNode } from "react";
import { useMessages } from "../lib/i18n/provider";

// The roster is geographic configuration; departments are optional assignments.

export interface TerritoryRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly ownerSub: string | null;
  readonly members: readonly MarketMember[];
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
                <TableTitleCell title={r.name} description={r.code} tooltip={r.name} />
              ),
            },
            {
              // The geographic members from configuration, not team scopes.
              id: "regions",
              header: PLANNING_TEXT.territoryRegions,
              cell: (r: TerritoryRow) => (
                <span className="gap-2xs flex flex-wrap justify-center">
                  {r.members.map((m) => <Tag key={m.key}>{m.label}</Tag>)}
                </span>
              ),
            },
            {
              /* 所属单位 (0052): the organisation's side of the joint, beside
                 the ground it covers. */
              id: "units",
              header: PLANNING_TEXT.territoryUnits,
              cell: (r: TerritoryRow) =>
                r.units.length === 0
                  ? <span className="text-muted-foreground text-body-small whitespace-nowrap">{PLANNING_TEXT.territoryNoUnit}</span>
                  : r.units.join(" / "),
            },
            {
              id: "owner",
              header: PLANNING_TEXT.territoryOwner,
              cell: (r: TerritoryRow) =>
                memberName(r.ownerSub) ?? PLANNING_TEXT.territoryNoOwner,
            },
          ]}
        />
      )}
    </Section>
  );
}
