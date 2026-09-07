"use client";

import { useState } from "react";
import { DataTable, EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { SaveCell } from "./save-cell";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, rowClickSelection } from "./table-fittings";
import type { RoutingBasis } from "../../domains/signal/lib/routing";

// Where each open lead WOULD go, and one button per lead to make it so.
//
// A PREVIEW, NOT A ROUTER THAT RAN. Assignment moves work between people, and
// the case somebody must see before it lands is precisely the one where the
// rule reaches a wrong answer - a territory nobody finished configuring, a
// region no territory covers. Applying is per-row for the same reason: the
// owner of a lead is who gets asked about it, so this is many decisions, not
// one batch wearing a batch's costume.
//
// UNROUTABLE ROWS STAY IN THE LIST. They are the ones that need somebody to
// fix the territory map, and hiding them would make the map look complete
// while leads quietly went nowhere.
//
// THE APPLY BUTTON IS NOT THE ACTION COLUMN. The three standard fittings are
// 选择 / 序号 / 操作 (table-fittings.tsx), and 操作 is the row's menu. Apply is
// this table's own business column - it is the decision the page exists to
// offer, and burying it in a menu would put one click behind two.

export interface RoutingRow {
  readonly leadId: string;
  readonly leadNo: string;
  readonly companyName: string;
  readonly currentOwner: string | null;
  readonly suggestedOwner: string | null;
  /** The region the rule routed on - null when the lead has none. */
  readonly region: string | null;
  /** WHAT THE RULE KNEW, not what it said. The sentence is built here from the
   * message dictionary - a rule's own wording is written for the rule layer's
   * reader and rendered verbatim it put English into a Chinese page (TD-010). */
  readonly basis: RoutingBasis | null;
  readonly unroutableReason: string | null;
}

export interface RoutingTableProps {
  readonly rows: readonly RoutingRow[];
  readonly canAssign: boolean;
  readonly onAssign: (input: {
    leadId: string;
    ownerSub: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function RoutingTable({ rows, canAssign, onAssign }: RoutingTableProps) {
  const { DATA_TABLE_LABELS, ROUTING_TEXT, SIGNAL_ACTION_ERROR } = useMessages();
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
                {
                  id: "suggested",
                  header: ROUTING_TEXT.colSuggested,
                  align: "center" as const,
                  cell: (r: RoutingRow) =>
                    r.unroutableReason ? (
                      <StatusBadge tone="warning">
                        {ROUTING_TEXT.unroutable[r.unroutableReason] ?? r.unroutableReason}
                      </StatusBadge>
                    ) : r.suggestedOwner === r.currentOwner ? (
                      // Already where the rule would put it. Saying so beats an
                      // apply button that changes nothing.
                      <span className="text-muted-foreground text-body-sm">
                        {ROUTING_TEXT.alreadyThere}
                      </span>
                    ) : (
                      <span className="text-foreground mono truncate text-body-sm">
                        {r.suggestedOwner}
                      </span>
                    ),
                },
                {
                  id: "basis",
                  header: ROUTING_TEXT.colBasis,
                  align: "center" as const,
                  // THE RULE'S REASONING, shown rather than summarised. "Why did
                  // this go to me" is the question a router is actually asked,
                  // and a page that cannot answer it gets overridden by hand
                  // until nobody trusts it.
                  cell: (r: RoutingRow) => (
                    <span className="text-muted-foreground text-body-sm">
                      {r.basis === null
                        ? "-"
                        : r.basis.contenders === 1
                          ? // The ground has one owner and load never ran -
                            // saying so plainly is what stops "why them" being
                            // asked twice.
                            ROUTING_TEXT.basisSole(r.basis.region, r.basis.territoryName)
                          : ROUTING_TEXT.basisTie(
                              r.basis.region,
                              r.basis.contenders,
                              r.basis.territoryName,
                              r.basis.load,
                            )}
                    </span>
                  ),
                },
                {
                  id: "apply",
                  header: ROUTING_TEXT.colApply,
                  align: "center" as const,
                  cell: (r: RoutingRow) =>
                    !canAssign || r.unroutableReason || r.suggestedOwner === r.currentOwner ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      // Per-row state. Sharing one hook across the table put the
                      // "assigned" badge - and any refusal - on every other row
                      // that still had a button.
                      <SaveCell
                        errors={SIGNAL_ACTION_ERROR}
                        label={ROUTING_TEXT.apply}
                        savedLabel={ROUTING_TEXT.applied}
                        onSave={() =>
                          onAssign({ leadId: r.leadId, ownerSub: r.suggestedOwner! })
                        }
                      />
                    ),
                },
              ]}
            />
          </div>
          {!canAssign ? (
            <p className="text-muted-foreground mt-sm text-body-sm">{ROUTING_TEXT.denied}</p>
          ) : null}
        </>
      )}
    </Section>
  );
}
