"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ActionMenu,
  DataTable,
  EmptyState,
  FilterBar,
  ListCard,
  ListCardGrid,
  StatusBadge,
  useToast,
  type DataTableColumn,
  type FilterBarView,
} from "@vxture/design-ui";
import type { AccountRecord } from "../../domains/account/store";
import { recomputeAccountHealth } from "../account/actions";
import { ACCOUNT_STATUS_LABEL, ACCOUNT_TEXT } from "../lib/messages";
import { healthTone } from "../lib/view-model";
import { TableCard } from "./table-card";

// The account list's table.
//
// It lives in a CLIENT component because DataTableColumn.cell is a function,
// and a function cannot cross the server/client boundary - React refuses to
// serialise it. Building these columns in the page (a server component) threw
// "Functions cannot be passed directly to Client Components" at render time,
// which `next build` never caught because the page is force-dynamic and is
// therefore never prerendered.
//
// The page keeps the gates and the data fetch; only the rendering moved.
//
// IT HAD NO ACTION COLUMN, so this page carried zero buttons and a customer
// could be read but never acted on - while recomputeAccountHealth sat wired in
// account/actions.ts. The convention everywhere else in this product is a
// PINNED last column with one trigger, and it applies here for the same reason
// it applies there: a wide table scrolls its own actions out of reach, and a
// row of buttons per row is a wall of chrome.

export interface AccountTableProps {
  readonly rows: readonly AccountRecord[];
  /** False when the member may read accounts but not recompute them. */
  readonly canRecompute?: boolean;
}

export function AccountTable({ rows, canRecompute = true }: AccountTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<FilterBarView>("list");
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        title={ACCOUNT_TEXT.emptyTitle}
        description={ACCOUNT_TEXT.emptyDescription}
      />
    );
  }

  function recompute(id: string, name: string) {
    setBusyId(id);
    start(async () => {
      const r = await recomputeAccountHealth(id);
      setBusyId(null);
      // The new number is announced rather than left for the reader to spot in
      // a re-rendered table: the whole point of asking was to learn what it
      // became, and a row that quietly changes colour does not answer that.
      toast(
        r.ok
          ? {
              tone: "success",
              title: ACCOUNT_TEXT.recomputedTitle,
              description: ACCOUNT_TEXT.recomputedOn(name, r.score ?? null),
            }
          : {
              tone: "danger",
              title: ACCOUNT_TEXT.recomputeFailed,
              description: r.error ?? "",
            },
      );
    });
  }

  function actions(row: AccountRecord) {
    return (
      <ActionMenu
        disabled={pending && busyId === row.id}
        items={[
          {
            id: "open",
            label: ACCOUNT_TEXT.openAccount,
            icon: "arrow-right",
            onSelect: () => router.push(`/account/${row.id}`),
          },
          {
            id: "recompute",
            label: ACCOUNT_TEXT.recompute,
            icon: "refresh",
            // Present and disabled rather than absent: a menu whose contents
            // change with the viewer teaches nobody what the product can do.
            disabled: !canRecompute,
            hint: canRecompute
              ? ACCOUNT_TEXT.recomputeHint
              : ACCOUNT_TEXT.recomputeDenied,
            onSelect: () => recompute(row.id, row.name),
          },
        ]}
      />
    );
  }

  const columns: readonly DataTableColumn<AccountRecord>[] = [
    {
      // EVERY COLUMN IS "auto" HERE, deliberately, and that is a departure
      // from the DS's default advice worth stating. Its width grades are
      // MINIMUMS meant to make six different tables agree with each other; on
      // this five-column table the smallest grade measured ~157px, so grading
      // industry and owner pushed them PAST the customer name and left the
      // title the narrowest column on the table at 136px, behind two columns
      // holding "零售" and a subject id. Auto distribution reads better here
      // because the name is the only column whose content actually varies.
      id: "name",
      header: ACCOUNT_TEXT.columnName,
      // A link rather than an onRowClick handler: navigable, middle-clickable
      // and shareable in a way a click handler is not.
      cell: (row) => (
        <div className="flex flex-col gap-3xs">
          <Link
            href={`/account/${row.id}`}
            className="text-foreground hover:underline"
          >
            {row.name}
          </Link>
          <div className="text-muted-foreground text-xs tabular-nums">
            {row.accountNo}
          </div>
        </div>
      ),
    },
    {
      id: "industry",
      header: ACCOUNT_TEXT.columnIndustry,
      cell: (row) => row.industry ?? "-",
    },
    {
      id: "owner",
      header: ACCOUNT_TEXT.columnOwner,
      // The raw subject, marked as one. There is no display name on the record
      // to resolve it against, and this file's own sibling says why that
      // matters - "an overdue promise that shows a UUID is one nobody chases".
      // Until the directory lands, the honest rendering is a monospaced id that
      // LOOKS like an id, rather than a machine string dressed as a person and
      // given the second-widest column on the table.
      cell: (row) =>
        row.ownerSub ? (
          <span className="text-muted-foreground font-mono text-xs">
            {row.ownerSub}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            {ACCOUNT_TEXT.ownerNone}
          </span>
        ),
    },
    {
      id: "health",
      header: ACCOUNT_TEXT.columnHealth,
      align: "center",
      cell: (row) =>
        row.healthScore == null ? (
          <StatusBadge tone="neutral">{ACCOUNT_TEXT.unscored}</StatusBadge>
        ) : (
          <StatusBadge tone={healthTone(row.healthScore)}>
            {row.healthScore}
          </StatusBadge>
        ),
    },
    {
      id: "status",
      header: ACCOUNT_TEXT.columnStatus,
      align: "center",
      cell: (row) => (
        <StatusBadge tone={row.status === "churned" ? "danger" : "neutral"} dot>
          {ACCOUNT_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      {/* The tool row: what this list looks like, and how many are in it.
          FilterBar owns the arrangement, so the page does not invent a second
          toolbar grammar. */}
      <FilterBar
        view={view}
        onViewChange={setView}
        count={ACCOUNT_TEXT.rowCount(rows.length)}
      />

      {/* ONLY THE TABLE IS IN A CARD, not the section: the section is a heading
          and its tools, the card is the surface the rows sit on. */}
      <TableCard>
        {view === "list" ? (
          <DataTable
            leadingSpacer
            indexStart={1}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowActions={actions}
          />
        ) : (
          <ListCardGrid className="p-md">
            {rows.map((row) => (
              <ListCard
                key={row.id}
                title={
                  <Link href={`/account/${row.id}`} className="hover:underline">
                    {row.name}
                  </Link>
                }
                description={row.accountNo}
                status={
                  row.healthScore == null ? (
                    <StatusBadge tone="neutral">
                      {ACCOUNT_TEXT.unscored}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone={healthTone(row.healthScore)}>
                      {row.healthScore}
                    </StatusBadge>
                  )
                }
                actions={actions(row)}
                meta={
                  <>
                    <span>{row.industry ?? "-"}</span>
                    <span>
                      {ACCOUNT_STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </>
                }
              />
            ))}
          </ListCardGrid>
        )}
      </TableCard>
    </>
  );
}
