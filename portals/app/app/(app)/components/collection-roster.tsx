"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  Button,
  DataTable,
  DialogForm,
  EmptyState,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  MoneyCell,
  RowActions,
  rowClickSelection,
} from "./table-fittings";
import { allowedRevenueMoves, type RevenueStatus } from "../../domains/delivery/lib/revenue";

// 回款清单 - the catalogue module's pattern, applied to the collections
// schedule.
//
// TWO SECTIONS. What is still owed is this month's work; what is settled or
// written off is the record. The old single table carried both and let a
// terminal row sit between two live ones.
//
// THE MENU OFFERS EXACTLY THE LEGAL MOVES, read from the machine's own map.
// Listing all five statuses and letting the rule layer refuse four would teach
// people the product says no for reasons they cannot predict. A terminal row
// keeps the column with an empty, disabled trigger (the fittings ruling):
// money that arrived did arrive, and a write-off is reversed by a new schedule
// rather than by editing this row.
//
// SETTLING ASKS FOR THE AMOUNT IN A DIALOG, not a browser prompt. The rule
// layer refuses without it (actual_amount_required) and is right to: assuming
// the planned amount arrived would report money nobody has. What changed is
// the asking - `window.prompt` is not a DS element, cannot be styled, cannot
// say why it is asking, and validates nothing until the round trip.

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

export interface CollectionRosterProps {
  readonly rows: readonly CollectionRow[];
  readonly canWrite: boolean;
  readonly onMove: (input: {
    projectId: string;
    instalmentId: string;
    to: string;
    actualAmount?: number;
    currency?: string;
  }) => Promise<{ ok: boolean; status?: string; error?: string }>;
}

export function CollectionRoster({ rows, canWrite, onMove }: CollectionRosterProps) {
  const {
    DELIVERY_TEXT,
    DATA_TABLE_LABELS,
    REVENUE_ERROR,
    REVENUE_STATUS_LABEL,
  } = useMessages();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). One state
  // across both tables: the keys are instalment ids.
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [settling, setSettling] = useState<CollectionRow | null>(null);
  const [amount, setAmount] = useState("");

  const open = rows.filter((r) => r.status !== "settled" && r.status !== "written_off");
  const closed = rows.filter((r) => r.status === "settled" || r.status === "written_off");

  const tone = (s: RevenueStatus) =>
    s === "settled" ? "success" : s === "overdue" ? "danger" : s === "written_off" ? "neutral" : "info";

  const move = (row: CollectionRow, to: string, actualAmount?: number) =>
    start(() => {
      void onMove({
        projectId: row.projectId,
        instalmentId: row.id,
        to,
        actualAmount,
        currency: row.currency,
      }).then((r) => {
        if (!r.ok) {
          toast({ tone: "danger", title: REVENUE_ERROR[r.error ?? "denied"] ?? r.error ?? "" });
          return;
        }
        setSettling(null);
        toast({
          tone: "success",
          title: DELIVERY_TEXT.moved(
            (REVENUE_STATUS_LABEL as Record<string, string>)[r.status ?? ""] ?? r.status ?? "",
          ),
        });
      });
    });

  const columns = [
    {
      id: "project",
      header: DELIVERY_TEXT.colProject,
      cell: (r: CollectionRow) => (
        <span className="flex min-w-0 flex-col">
          {/* 主标题字号加大加粗，副行是期次 (owner, 2026-09-06). */}
          <span className="text-foreground truncate text-body-lg font-semibold">
            {r.projectName}
          </span>
          <span className="text-muted-foreground truncate text-body-sm">
            {DELIVERY_TEXT.instalmentSeq(r.sequence)}
          </span>
        </span>
      ),
    },
    {
      id: "planned",
      header: DELIVERY_TEXT.colPlanned,
      align: "right" as const,
      cell: (r: CollectionRow) => (
        <MoneyCell pad="0.5rem">{r.plannedAmount.toLocaleString()}</MoneyCell>
      ),
    },
    {
      id: "actual",
      header: DELIVERY_TEXT.colActual,
      align: "right" as const,
      // A short payment is shown as short rather than rounded away: the gap
      // between planned and received is the number this table is for.
      cell: (r: CollectionRow) =>
        r.actualAmount == null ? (
          <MoneyCell pad="0.5rem">
            <span className="text-muted-foreground">-</span>
          </MoneyCell>
        ) : (
          <MoneyCell pad="0.5rem">
            <span
              className={
                r.actualAmount < r.plannedAmount ? "text-(color:--warning-text)" : undefined
              }
            >
              {r.actualAmount.toLocaleString()}
            </span>
          </MoneyCell>
        ),
    },
    {
      id: "due",
      header: DELIVERY_TEXT.colDueStatus,
      align: "center" as const,
      // DUE OVER STATUS IN ONE CELL, the shape the delivery table settled on:
      // "eight days late, and marked overdue" is ONE reading, and splitting it
      // across two columns made the reader assemble it - while costing a
      // column the project name needed (it was down to 72px).
      //
      // HOW LATE, NOT WHEN. A collections table's whole subject is money that
      // has not arrived, and a bare 2026-08-29 makes every reader subtract
      // today's date in their head - while the dock beside it was already
      // saying "8 days overdue" (owner, 2026-09-06). Terminal rows keep the
      // plain date: a settled instalment's due date is history, not a clock.
      cell: (r: CollectionRow) => {
        const settledRow = r.status === "settled" || r.status === "written_off";
        const late =
          r.dueAt === null
            ? null
            : Math.floor((Date.now() - Date.parse(`${r.dueAt}T00:00:00Z`)) / 86_400_000);
        const clock =
          r.dueAt === null ? (
            <span className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.noDueDate}</span>
          ) : settledRow ? (
            <span className="text-muted-foreground tabular-nums text-body-sm">{r.dueAt}</span>
          ) : (late ?? 0) > 0 ? (
            <span className="text-(color:--danger-text) font-semibold tabular-nums text-body-sm">
              {DELIVERY_TEXT.overdueBy(late ?? 0)}
            </span>
          ) : (
            <span className="text-foreground tabular-nums text-body-sm">
              {DELIVERY_TEXT.dueIn(-(late ?? 0))}
            </span>
          );
        return (
          <span className="flex flex-col items-center gap-3xs">
            {clock}
            <StatusBadge tone={tone(r.status)}>
              {REVENUE_STATUS_LABEL[r.status] ?? r.status}
            </StatusBadge>
          </span>
        );
      },
    },
  ];

  /* THE KEY ACTION IS OUT IN THE OPEN, the rest behind the dots - the shape
     the renewal table settled on. 登记回款 is what people come to this page to
     do; leaving it two clicks deep inside a menu costs the page's purpose. The
     dots keep the FULL set beside it, so nothing is reachable only through the
     shortcut. */
  const rowActions = (row: CollectionRow) => {
    const canSettle = canWrite && allowedRevenueMoves(row.status).includes("settled");
    return (
      <span className="flex items-center justify-end gap-2xs">
        {canSettle ? (
          <Button
            size="xs"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setAmount(String(row.plannedAmount));
              setSettling(row);
            }}
          >
            {DELIVERY_TEXT.settleShort}
          </Button>
        ) : null}
        <RowActions
      disabled={pending}
      items={
        !canWrite
          ? []
          : allowedRevenueMoves(row.status).map((to) => ({
              id: to,
              label: `${DELIVERY_TEXT.moveTo} ${REVENUE_STATUS_LABEL[to] ?? to}`,
              onSelect: () => {
                if (to === "settled") {
                  setAmount(String(row.plannedAmount));
                  setSettling(row);
                  return;
                }
                move(row, to);
              },
            }))
      }
        />
      </span>
    );
  };

  /* THE FIXED COLUMNS ARE FIXED AND EVERYTHING ELSE IS DIVIDED EQUALLY
     (owner, 2026-09-06). 选择 / 序号 / 操作 carry a width and no other column
     does; table-fixed hands out the remainder in equal shares by itself. */
  const table = (list: readonly CollectionRow[], empty: ReactNode) => {
    const select = rowClickSelection(list, (r) => r.id, selected, setSelected);
    return (
      <div
        ref={select.ref}
        className={`[&_table]:table-fixed ${EDGE_COLUMNS} [&_thead_th:last-child]:w-[8rem] ${select.className}`}
      >
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowKey={(r: CollectionRow) => r.id}
          rows={[...list]}
          columns={columns}
          rowActions={rowActions}
          empty={empty}
        />
      </div>
    );
  };

  const overdue = open.filter((r) => r.status === "overdue").length;

  return (
    <>
      <Section
        id="collections"
        icon={moduleIcon("collection")}
        title={DELIVERY_TEXT.rosterOpen}
        description={DELIVERY_TEXT.rosterOpenWhy}
        action={
          overdue > 0 ? (
            <StatusBadge tone="danger">{DELIVERY_TEXT.overdueCount(overdue)}</StatusBadge>
          ) : undefined
        }
      >
        {table(
          open,
          <EmptyState
            title={DELIVERY_TEXT.noInstalments}
            description={DELIVERY_TEXT.collectionsWhy}
          />,
        )}
      </Section>

      {closed.length > 0 ? (
        <Section
          id="collections-closed"
          icon="file-text"
          title={DELIVERY_TEXT.rosterClosed}
          description={DELIVERY_TEXT.rosterClosedWhy}
        >
          {table(
            closed,
            <EmptyState
              title={DELIVERY_TEXT.noInstalments}
              description={DELIVERY_TEXT.collectionsWhy}
            />,
          )}
        </Section>
      ) : null}

      {settling ? (
        <DialogForm
          open
          onOpenChange={(o: boolean) => {
            if (!o) setSettling(null);
          }}
          title={DELIVERY_TEXT.settleTitle}
          submitLabel={DELIVERY_TEXT.settleConfirm}
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(amount);
            if (!Number.isFinite(n) || n < 0) return;
            move(settling, "settled", n);
          }}
        >
          <Field>
            <FieldLabel>{DELIVERY_TEXT.settleAmount}</FieldLabel>
            <Input
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
            />
            {/* Said before the first attempt, not after the refusal. */}
            <FieldDescription>{DELIVERY_TEXT.settleAsk}</FieldDescription>
          </Field>
        </DialogForm>
      ) : null}
    </>
  );
}
