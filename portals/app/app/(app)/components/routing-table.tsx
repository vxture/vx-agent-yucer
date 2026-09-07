"use client";

import { useState } from "react";
import { DataTable, EmptyState, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, rowClickSelection } from "./table-fittings";

// 待分派的线索清单 - the open leads, and nothing else.
//
// A LIST, NOT A DASHBOARD (owner, 2026-09-06: 有些过度设计，复杂化了). This table
// used to carry the rule's suggestion, its reasoning and an apply button per
// row, on top of a statistics strip and three charts above it. All of that was
// the ANALYSIS, and the analysis is now something a person asks for, with its
// result - and its 采纳 - in the assistant panel. Two places offering the same
// move is how a page stops being readable.
//
// WHAT STAYS IS WHAT A LEAD IS: who it is, which region it falls in, who holds
// it. The region stays because it is a fact about the lead rather than a
// conclusion about it - and it is the fact the router turns on, so a reader
// checking a suggestion needs it in front of them.

export interface RoutingRow {
  readonly leadId: string;
  readonly leadNo: string;
  readonly companyName: string;
  readonly currentOwner: string | null;
  /** The region the router turns on - null when the lead has none. */
  readonly region: string | null;
}

export interface RoutingTableProps {
  readonly rows: readonly RoutingRow[];
}

export function RoutingTable({ rows }: RoutingTableProps) {
  const { DATA_TABLE_LABELS, ROUTING_TEXT } = useMessages();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). Clicking
  // anywhere on the row toggles it; the checkbox alone is too small to aim at
  // (owner, 2026-09-06).
  const [selected, setSelected] = useState<readonly string[]>([]);
  const select = rowClickSelection(rows, (r) => r.leadId, selected, setSelected);

  return (
    <Section id="routing" icon="user-switch">
      {rows.length === 0 ? (
        <EmptyState title={ROUTING_TEXT.none} description={ROUTING_TEXT.noneWhy} />
      ) : (
        <>
          {/* 除了固定的，其余均分 (owner, 2026-09-06). 选择 / 序号 / 操作 carry a
              width and no other column does; under table-fixed the browser
              hands out the remainder in equal shares by itself. The classes
              sit on the WRAPPER because they reach into the table the DS
              renders - passing them to DataTable's own className lands them a
              level too high and pins nothing. */}
          <div
            ref={select.ref}
            className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} ${select.className}`}
          >
            <DataTable
              labels={DATA_TABLE_LABELS}
              rowKey={(r: RoutingRow) => r.leadId}
              rows={[...rows]}
              selectedKeys={selected}
              onSelectionChange={setSelected}
              indexStart={1}
              rowActions={() => <RowActions items={[]} />}
              columns={[
                {
                  id: "lead",
                  header: ROUTING_TEXT.colLead,
                  cell: (r: RoutingRow) => (
                    <span className="flex min-w-0 flex-col">
                      {/* 主标题字号加大、加粗；副行是线索号 (owner, 2026-09-06). */}
                      <span className="text-foreground truncate text-body-lg font-semibold">
                        {r.companyName}
                      </span>
                      <span className="text-muted-foreground truncate text-body-sm tabular-nums">
                        {r.leadNo}
                      </span>
                    </span>
                  ),
                },
                {
                  id: "region",
                  header: ROUTING_TEXT.colRegion,
                  align: "center" as const,
                  // THE RULE'S FIRST INPUT, and it was not on this page at all
                  // before. Territory cover is decided by the region and by
                  // nothing else, so a row that does not show it is asking the
                  // reader to trust the basis text without the fact under it.
                  cell: (r: RoutingRow) =>
                    r.region ? (
                      <span className="text-foreground text-body-sm">{r.region}</span>
                    ) : (
                      <span className="text-(color:--warning-text) text-body-sm">
                        {ROUTING_TEXT.noRegion}
                      </span>
                    ),
                },
                {
                  id: "current",
                  header: ROUTING_TEXT.colCurrent,
                  align: "center" as const,
                  cell: (r: RoutingRow) =>
                    r.currentOwner ? (
                      <span className="text-muted-foreground mono truncate text-body-sm">
                        {r.currentOwner}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-body-sm">
                        {ROUTING_TEXT.unowned}
                      </span>
                    ),
                },
              ]}
            />
          </div>
        </>
      )}
    </Section>
  );
}
