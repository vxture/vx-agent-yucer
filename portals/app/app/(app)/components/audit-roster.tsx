"use client";

import {
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  NativeSelect,
  StatusBadge,
  TableTitleCell,
  useListPagination,
} from "@vxture/design-ui";
import { useState } from "react";
import { useMessages } from "../lib/i18n/provider";
import { ACTION_COLUMN, EDGE_COLUMNS, PaginationFooter, RowActions, SearchSlot, FilterSlot, useTableSort } from "./table-fittings";
import type { AuditOutcome } from "../../audit/lib/store";

/**
 * 安全审计 - a browsable, filtered record of CONFIGURATION changes only
 * (owner, 2026-09-17): member and role administration writes, never business
 * data. Read-only, same shape as scope-table.tsx (数据范围) - a security log
 * is a fact to browse, not a form to submit.
 */

export interface AuditRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorSub: string;
  readonly actorName: string;
  readonly action: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly outcome: AuditOutcome;
}

const SORT_ON = {
  time: (r: AuditRow) => r.occurredAt.getTime(),
  actor: (r: AuditRow) => r.actorName,
  action: (r: AuditRow) => r.action,
  outcome: (r: AuditRow) => r.outcome,
};

export function AuditRoster({ rows }: { readonly rows: readonly AuditRow[] }) {
  const { AUDIT_TEXT, DATA_TABLE_LABELS, TABLE_TOOLBAR_TEXT } = useMessages();
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");

  const actionOptions = Object.keys(AUDIT_TEXT.actionLabel);

  const match = (r: AuditRow) => {
    const q = query.trim().toLowerCase();
    return (
      (q === "" ||
        r.actorName.toLowerCase().includes(q) ||
        r.actorSub.toLowerCase().includes(q) ||
        r.objectId.toLowerCase().includes(q)) &&
      (actionFilter === "" || r.action === actionFilter) &&
      (outcomeFilter === "" || r.outcome === outcomeFilter)
    );
  };
  const narrowed = query.trim() !== "" || actionFilter !== "" || outcomeFilter !== "";
  const filtered = rows.filter(match);

  const sorted = useTableSort<AuditRow>([], SORT_ON, { columnId: "time", direction: "desc" });
  const sortedRows = sorted.sortRows(filtered);
  const pagination = useListPagination(sortedRows, 20);

  const tone = (o: AuditOutcome) =>
    o === "success" ? "success" : o === "denied" ? "warning" : "danger";

  return (
    <div className="gap-md flex flex-col">
      <FilterBar
        count={
          narrowed
            ? TABLE_TOOLBAR_TEXT.filteredCount(filtered.length, rows.length)
            : AUDIT_TEXT.count(rows.length)
        }
        search={
          <SearchSlot>
            <Input
              type="search"
              className="w-full"
              value={query}
              placeholder={AUDIT_TEXT.searchHint}
              aria-label={TABLE_TOOLBAR_TEXT.searchLabel}
              onChange={(e) => setQuery(e.target.value)}
            />
          </SearchSlot>
        }
        onReset={
          narrowed
            ? () => {
                setQuery("");
                setActionFilter("");
                setOutcomeFilter("");
              }
            : undefined
        }
        resetLabel={TABLE_TOOLBAR_TEXT.resetFilters}
      >
        <FilterSlot width="w-[10rem]">
          <NativeSelect
            value={actionFilter}
            aria-label={AUDIT_TEXT.filterAllActions}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">{AUDIT_TEXT.filterAllActions}</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {AUDIT_TEXT.actionLabel[a] ?? a}
              </option>
            ))}
          </NativeSelect>
        </FilterSlot>
        <FilterSlot width="w-[8rem]">
          <NativeSelect
            value={outcomeFilter}
            aria-label={AUDIT_TEXT.filterAllOutcomes}
            onChange={(e) => setOutcomeFilter(e.target.value)}
          >
            <option value="">{AUDIT_TEXT.filterAllOutcomes}</option>
            {(Object.keys(AUDIT_TEXT.outcomeLabel) as AuditOutcome[]).map((o) => (
              <option key={o} value={o}>
                {AUDIT_TEXT.outcomeLabel[o] ?? o}
              </option>
            ))}
          </NativeSelect>
        </FilterSlot>
      </FilterBar>

      <div className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`}>
        <DataTable
          labels={DATA_TABLE_LABELS}
          leadingSpacer
          indexStart={pagination.indexStart}
          rowActions={() => <RowActions items={[]} />}
          rowKey={(r: AuditRow) => r.id}
          rows={pagination.pageRows}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
          columns={[
            {
              id: "time",
              header: AUDIT_TEXT.colTime,
              sortable: true,
              cell: (r: AuditRow) => (
                <span className="tabular-nums text-body-sm">
                  {r.occurredAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              ),
            },
            {
              id: "actor",
              header: AUDIT_TEXT.colActor,
              sortable: true,
              cell: (r: AuditRow) => (
                <TableTitleCell title={r.actorName} description={r.actorSub} tooltip={r.actorName} />
              ),
            },
            {
              id: "action",
              header: AUDIT_TEXT.colAction,
              sortable: true,
              cell: (r: AuditRow) => AUDIT_TEXT.actionLabel[r.action] ?? r.action,
            },
            {
              id: "object",
              header: AUDIT_TEXT.colObject,
              cell: (r: AuditRow) => (
                <span className="text-body-sm">
                  {r.objectType} · <span className="text-muted-foreground">{r.objectId}</span>
                </span>
              ),
            },
            {
              id: "outcome",
              header: AUDIT_TEXT.colOutcome,
              sortable: true,
              cell: (r: AuditRow) => (
                <StatusBadge tone={tone(r.outcome)}>
                  {AUDIT_TEXT.outcomeLabel[r.outcome] ?? r.outcome}
                </StatusBadge>
              ),
            },
          ]}
          empty={
            narrowed ? (
              <EmptyState title={TABLE_TOOLBAR_TEXT.noMatch} description={TABLE_TOOLBAR_TEXT.noMatchWhy} />
            ) : (
              <EmptyState title={AUDIT_TEXT.empty} description={AUDIT_TEXT.emptyWhy} />
            )
          }
        />
      </div>
      {rows.length > 0 ? <PaginationFooter pagination={pagination} total={filtered.length} /> : null}
    </div>
  );
}
