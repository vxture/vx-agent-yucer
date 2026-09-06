"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import { RowActions, rowClickSelection } from "./table-fittings";

// 续约清单 - the catalogue module's pattern, applied to renewals.
//
// TWO SECTIONS, and the split is the page's argument. What is DUE is this
// quarter's work; what is NOT is kept because one of its reasons is a defect:
// `no_end_date` on a subscription means the term will never come round on any
// screen. The old single table carried both with a verdict column, which put
// a data gap and a healthy renewal on the same line of sight.
//
// A PROPOSAL, NEVER A WRITE. Opening a renewal is a commercial approach to a
// customer - ADR-003 at its sharpest - so it is a row operation a person takes
// one customer at a time. There is deliberately no bulk equivalent: a "renew
// everything" control would approach a dozen customers on one click.
//
// THE RISK COLUMN READS THE DERIVED HEALTH, not the one the delivery team
// reported. A green report next to an overdue instalment is precisely the case
// where the reported answer is the wrong one to act on.

export interface RenewalRow {
  readonly projectId: string;
  readonly projectNo: string;
  readonly projectName: string;
  /** Negative once the term has lapsed, which is when it matters most. */
  readonly daysToEnd: number | null;
  readonly amount: number | null;
  readonly currency: string;
  readonly risk: "low" | "watch" | null;
  /** Why it is not due, when it is not. */
  readonly notDueReason: string | null;
}

export interface RenewalRosterProps {
  readonly rows: readonly RenewalRow[];
  readonly canOpen: boolean;
  readonly onOpen: (input: {
    projectId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function RenewalRoster({ rows, canOpen, onOpen }: RenewalRosterProps) {
  const { DATA_TABLE_LABELS, RENEWAL_TEXT, RENEWAL_ERROR } = useMessages();
  const [pending, startTransition] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). One state
  // across both tables: the keys are project ids.
  const [selected, setSelected] = useState<readonly string[]>([]);
  const { toast } = useToast();

  const due = rows.filter((r) => r.notDueReason === null);
  const notDue = rows.filter((r) => r.notDueReason !== null);

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({
          tone: "danger",
          title: RENEWAL_ERROR[r.error ?? "denied"] ?? RENEWAL_ERROR.denied,
        });
      });
    });

  const columns = [
    {
      id: "project",
      header: RENEWAL_TEXT.colProject,
      cell: (r: RenewalRow) => (
        <span className="flex min-w-0 flex-col">
          {/* 主标题字号加大加粗，副编号保持小字 (owner, 2026-09-06). */}
          <span className="text-foreground truncate text-body-lg font-semibold">
            {r.projectName}
          </span>
          <span className="text-muted-foreground mono truncate text-body-sm">{r.projectNo}</span>
        </span>
      ),
    },
    {
      id: "ends",
      header: RENEWAL_TEXT.colEnds,
      width: "sm" as const,
      align: "center" as const,
      cell: (r: RenewalRow) =>
        r.daysToEnd === null ? (
          <span className="text-muted-foreground text-body-sm">{RENEWAL_TEXT.noEndDate}</span>
        ) : r.daysToEnd < 0 ? (
          // A LAPSED TERM IS NOT "-12 days left". Saying it the other way round
          // is what makes it read as the most urgent row rather than the
          // furthest-away one.
          <StatusBadge tone="danger">{RENEWAL_TEXT.lapsed(-r.daysToEnd)}</StatusBadge>
        ) : (
          <span className="text-foreground text-body-sm tabular-nums">
            {RENEWAL_TEXT.dueIn(r.daysToEnd)}
          </span>
        ),
    },
    {
      id: "amount",
      header: RENEWAL_TEXT.colAmount,
      width: "sm" as const,
      align: "center" as const,
      // WHAT LAST TERM WAS WORTH, carried forward unchanged. What the next one
      // is worth is a negotiation, and seeding it with an invented uplift puts
      // a number nobody chose in front of a customer.
      cell: (r: RenewalRow) => (
        <span className="text-foreground text-body-sm tabular-nums">
          {formatMoney(r.amount, r.currency)}
        </span>
      ),
    },
    {
      id: "verdict",
      header: RENEWAL_TEXT.colVerdict,
      width: "sm" as const,
      align: "center" as const,
      cell: (r: RenewalRow) =>
        r.notDueReason ? (
          <span className="text-muted-foreground text-body-sm">
            {RENEWAL_TEXT.notDue[r.notDueReason] ?? r.notDueReason}
          </span>
        ) : (
          <StatusBadge tone={r.risk === "watch" ? "warning" : "success"}>
            {RENEWAL_TEXT.risk[r.risk ?? "low"] ?? ""}
          </StatusBadge>
        ),
    },
  ];

  /* ALWAYS rendered (the 2026-09-06 fittings ruling): a reader who may not
     open opportunities gets the column with an empty, disabled trigger rather
     than a table one column narrower than a colleague's. A not-due row gets
     the same empty menu for a different reason - there is nothing to open. */
  const rowActions = (row: RenewalRow) => (
    <RowActions
      disabled={pending}
      items={
        !canOpen || row.notDueReason !== null
          ? []
          : [
              {
                id: "open",
                label: RENEWAL_TEXT.open,
                onSelect: () => run(onOpen({ projectId: row.projectId })),
              },
            ]
      }
    />
  );

  /* The catalogue rosters' geometry (TD-022), COUNTED FROM THE LEFT: the
     leading pair 选择 | 序号 is unconditional, so the business columns start
     at nth-child(3) and nothing to their left can disappear. A min-width so a
     narrow shell scrolls rather than crushing the project name.
     Order: 选择 | # | project | ends | amount | verdict | 操作 */
  const table = (list: readonly RenewalRow[], empty: ReactNode) => {
    const select = rowClickSelection(list, (r) => r.projectId, selected, setSelected);
    return (
      <div
        ref={select.ref}
        className={`[&_table]:table-fixed [&_table]:min-w-[44rem] [&_thead_th:nth-child(4)]:w-[7rem] [&_thead_th:nth-child(5)]:w-[7rem] [&_thead_th:nth-child(6)]:w-[7rem] [&_thead_th:last-child]:w-control-3xl ${select.className}`}
      >
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowKey={(r: RenewalRow) => r.projectId}
          rows={[...list]}
          columns={columns}
          rowActions={rowActions}
          empty={empty}
        />
      </div>
    );
  };

  return (
    <>
      <Section
        id="renewal"
        icon={moduleIcon("renewal")}
        title={RENEWAL_TEXT.rosterDue}
        description={RENEWAL_TEXT.rosterDueWhy}
      >
        {table(
          due,
          <EmptyState title={RENEWAL_TEXT.none} description={RENEWAL_TEXT.noneWhy} />,
        )}
        {!canOpen ? (
          <p className="text-muted-foreground mt-sm text-body-sm">{RENEWAL_TEXT.denied}</p>
        ) : null}
      </Section>

      {notDue.length > 0 ? (
        <Section
          id="renewal-not-due"
          icon="file-text"
          title={RENEWAL_TEXT.rosterNotDue}
          description={RENEWAL_TEXT.rosterNotDueWhy}
        >
          {table(
            notDue,
            <EmptyState title={RENEWAL_TEXT.none} description={RENEWAL_TEXT.noneWhy} />,
          )}
        </Section>
      ) : null}
    </>
  );
}
