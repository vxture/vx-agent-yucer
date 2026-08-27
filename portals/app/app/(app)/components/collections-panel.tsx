"use client";

import { useTransition } from "react";
import { ActionMenu, DataTable, EmptyState, Section, StatusBadge, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { allowedRevenueMoves, type RevenueStatus } from "../../domains/delivery/lib/revenue";

// The collections schedule, and the control that moves it.
//
// WHY THIS EXISTS AS A SURFACE. `transitionInstalment` shipped in batch 2 with
// a gate, a transition map and tests, and had no caller for four months -
// `projectView` returned the instalments and nothing rendered them. It was
// filed as "unwired" until someone looked and found the gap was not a server
// action but a screen, which is a different size of job. That distinction is
// now in the workplan; this file is the part that closes it.
//
// THE MENU OFFERS EXACTLY THE LEGAL MOVES, read from the machine's own map.
// Listing all five statuses and letting the rule layer refuse four would teach
// people the product says no for reasons they cannot predict.
//
// A TERMINAL ROW GETS NO MENU. `settled` and `written_off` have no moves at
// all: money that arrived did arrive, and a write-off is reversed by a new
// schedule rather than by editing this row.

export interface CollectionRow {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly sequence: number;
  readonly status: RevenueStatus;
  readonly plannedAmount: number;
  readonly actualAmount: number | null;
  readonly currency: string;
  readonly dueAt: string | null;
}

export interface CollectionsPanelProps {
  readonly rows: readonly CollectionRow[];
  readonly overdue: number;
  readonly canWrite: boolean;
  readonly onMove: (input: {
    projectId: string;
    instalmentId: string;
    to: string;
    actualAmount?: number;
    currency?: string;
  }) => Promise<{ ok: boolean; status?: string; error?: string }>;
}

export function CollectionsPanel({ rows, overdue, canWrite, onMove }: CollectionsPanelProps) {
  const { DELIVERY_TEXT, DATA_TABLE_LABELS, DS_LABELS, REVENUE_ERROR, REVENUE_STATUS_LABEL } =
    useMessages();
  const { toast } = useToast();
  const [, start] = useTransition();

  const tone = (s: RevenueStatus) =>
    s === "settled" ? "success" : s === "overdue" ? "danger" : s === "written_off" ? "neutral" : "info";

  function actions(row: CollectionRow) {
    if (!canWrite) return null;
    const moves = allowedRevenueMoves(row.status);
    if (moves.length === 0) return null;
    return (
      <ActionMenu
        label={DS_LABELS.actionMenu}
        items={moves.map((to) => ({
          id: to,
          label: `${DELIVERY_TEXT.moveTo} ${REVENUE_STATUS_LABEL[to] ?? to}`,
          onSelect: () =>
            start(() => {
              // SETTLING ASKS FOR THE AMOUNT. The rule layer refuses without it
              // (actual_amount_required) and it is right to: assuming the
              // planned amount arrived would report money nobody has. Short
              // payment is normal, and that difference is the whole reason
              // collections are tracked separately from invoicing.
              let actualAmount: number | undefined;
              if (to === "settled") {
                const typed = window.prompt(
                  DELIVERY_TEXT.settleAsk,
                  String(row.plannedAmount),
                );
                if (typed === null) return;
                const n = Number(typed);
                if (!Number.isFinite(n) || n < 0) return;
                actualAmount = n;
              }
              void onMove({
                projectId: row.projectId,
                instalmentId: row.id,
                to,
                actualAmount,
                currency: row.currency,
              }).then((r) => {
                if (!r.ok) {
                  return toast({
                    tone: "danger",
                    title: REVENUE_ERROR[r.error ?? "denied"] ?? r.error ?? "",
                  });
                }
                toast({
                  tone: "success",
                  title: DELIVERY_TEXT.moved(
                    (REVENUE_STATUS_LABEL as Record<string, string>)[r.status ?? ""] ?? r.status ?? "",
                  ),
                });
              });
            }),
        }))}
      />
    );
  }

  return (
    <Section
      id="collections"
      icon="wallet"
      title={DELIVERY_TEXT.collections}
      description={DELIVERY_TEXT.collectionsWhy}
      action={
        overdue > 0 ? (
          <StatusBadge tone="danger">{DELIVERY_TEXT.overdueCount(overdue)}</StatusBadge>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState title={DELIVERY_TEXT.noInstalments} description={DELIVERY_TEXT.collectionsWhy} />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          leadingSpacer
          indexStart={1}
          rowKey={(r: CollectionRow) => r.id}
          rows={[...rows]}
          rowActions={canWrite ? actions : undefined}
          columns={[
            { id: "project", header: DELIVERY_TEXT.colProject, cell: (r: CollectionRow) => r.projectName },
            { id: "seq", header: DELIVERY_TEXT.colSeq, align: "right" as const, cell: (r: CollectionRow) => r.sequence },
            {
              id: "planned",
              header: DELIVERY_TEXT.colPlanned,
              align: "right" as const,
              cell: (r: CollectionRow) => r.plannedAmount.toLocaleString(),
            },
            {
              id: "actual",
              header: DELIVERY_TEXT.colActual,
              align: "right" as const,
              // A short payment is shown as short rather than rounded away: the
              // gap between planned and received is the number this table is for.
              cell: (r: CollectionRow) =>
                r.actualAmount == null ? (
                  <span className="text-muted-foreground">-</span>
                ) : (
                  <span
                    className={
                      r.actualAmount < r.plannedAmount ? "text-(color:--warning-text)" : undefined
                    }
                  >
                    {r.actualAmount.toLocaleString()}
                  </span>
                ),
            },
            {
              id: "due",
              header: DELIVERY_TEXT.colDue,
              cell: (r: CollectionRow) => r.dueAt ?? "-",
            },
            {
              id: "status",
              header: DELIVERY_TEXT.colRevStatus,
              cell: (r: CollectionRow) => (
                <StatusBadge tone={tone(r.status)}>
                  {REVENUE_STATUS_LABEL[r.status] ?? r.status}
                </StatusBadge>
              ),
            },
          ]}
        />
      )}
    </Section>
  );
}
