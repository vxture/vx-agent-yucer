"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BulkActionBar,
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  type DataTableColumn,
} from "@vxture/design-ui";
import { TableCard } from "./table-card";
import { useMessages } from "../lib/i18n/provider";

// The batch version of AccountCompleteness's derivable half - one table
// across every customer instead of one section per record.
//
// STILL ONE WRITE PER ROW ON THE SERVER. Selecting fifty rows and clicking
// apply does not become one bulk statement; it becomes fifty individually
// gated fillAccountField() calls (see complete/actions.ts). Batching is a
// selection convenience for the reader, not a shortcut around the permission
// check each write already carries.

export interface BatchGapRow {
  readonly key: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly field: string;
  readonly suggestion: string;
  readonly basis: string | null;
}

export interface BatchCompletenessProps {
  readonly rows: readonly BatchGapRow[];
  readonly canApply: boolean;
  readonly onApply: (
    items: ReadonlyArray<{ accountId: string; field: string; value: string }>,
  ) => Promise<{
    applied: number;
    failed: ReadonlyArray<{ accountId: string; field: string; error: string }>;
  }>;
}

export function BatchCompleteness({
  rows,
  canApply,
  onApply,
}: BatchCompletenessProps) {
  const {
    BATCH_COMPLETE_TEXT,
    BATCH_COMPLETE_ERROR,
    COMPLETENESS_TEXT,
    DATA_TABLE_LABELS,
    DS_LABELS,
  } = useMessages();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  // The count in `result` says how many rows failed, not why. A refusal
  // rendered as a raw violation code is exactly what reachable-codes.test.ts
  // exists to catch (TD-010) - the FIRST reason is shown, matching how
  // proposal-queue.tsx reports a partial batch failure.
  const [error, setError] = useState<string | null>(null);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.key)),
    [rows, selected],
  );

  function apply() {
    setApplying(true);
    setResult(null);
    setError(null);
    startTransition(() => {
      void onApply(
        selectedRows.map((r) => ({
          accountId: r.accountId,
          field: r.field,
          value: r.suggestion,
        })),
      )
        .then((r) => {
          setResult(BATCH_COMPLETE_TEXT.result(r.applied, r.failed.length));
          if (r.failed.length > 0) {
            setError(
              BATCH_COMPLETE_ERROR[r.failed[0].error] ??
                BATCH_COMPLETE_ERROR.not_found,
            );
          }
          setSelected(new Set());
        })
        .finally(() => setApplying(false));
    });
  }

  const columns: readonly DataTableColumn<BatchGapRow>[] = [
    {
      id: "account",
      header: BATCH_COMPLETE_TEXT.columnAccount,
      cell: (row) => (
        <a
          href={`/account/${row.accountId}`}
          className="text-foreground hover:underline"
        >
          {row.accountName}
        </a>
      ),
    },
    {
      id: "field",
      header: BATCH_COMPLETE_TEXT.columnField,
      cell: (row) => COMPLETENESS_TEXT.fields[row.field] ?? row.field,
    },
    {
      id: "suggestion",
      header: BATCH_COMPLETE_TEXT.columnSuggestion,
      cell: (row) => row.suggestion,
    },
    {
      id: "basis",
      header: BATCH_COMPLETE_TEXT.columnBasis,
      cell: (row) => (
        <span className="text-muted-foreground text-xs">{row.basis}</span>
      ),
    },
  ];

  return (
    <Section>
      {result ? <StatusBadge tone="info">{result}</StatusBadge> : null}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      <BulkActionBar
        count={selected.size}
        noun={BATCH_COMPLETE_TEXT.selectionNoun}
        selectionTemplate={DS_LABELS.bulkSelectionTemplate}
        toolbarLabel={DS_LABELS.bulkToolbar}
        clearLabel={BATCH_COMPLETE_TEXT.clearSelection}
        onClear={() => setSelected(new Set())}
        actions={[
          {
            id: "apply",
            label:
              pending || applying
                ? BATCH_COMPLETE_TEXT.applying
                : BATCH_COMPLETE_TEXT.apply,
            onSelect: apply,
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={BATCH_COMPLETE_TEXT.emptyTitle}
          description={BATCH_COMPLETE_TEXT.emptyDescription}
        />
      ) : (
        <TableCard>
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={1}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.key}
            selectedKeys={[...selected]}
            onSelectionChange={(keys) => setSelected(new Set(keys))}
            isRowSelectable={() => canApply}
          />
        </TableCard>
      )}
    </Section>
  );
}
