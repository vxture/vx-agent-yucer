"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { DataTable, EmptyState, Section, StatusBadge, useToast } from "@vxture/design-ui";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  MoneyCell,
  RowActions,
  rowClickSelection,
} from "./table-fittings";
import { worseThan, type ProjectHealth } from "../../domains/delivery/lib/delivery-stats";
import { DeliveryPlanFlow } from "./delivery-plan-flow";

// 交付清单 - the catalogue module's pattern, applied to projects.
//
// TWO SECTIONS. What is running is the work; delivered, closed and cancelled
// projects are the record. The old single table carried both, so a finished
// engagement sat between two live ones and the health column meant different
// things on adjacent rows.
//
// HEALTH OVER STATUS in one cell: "at risk, and still marked active" is one
// reading, and splitting it into two columns made the reader assemble it.
//
// THE DOWNGRADE IS MARKED ON THE ROW. When the derived reading is worse than
// the reported one, the cell says so - a green badge that is only the delivery
// team's own word, with no sign that the facts disagree, is the single thing
// this page exists to prevent.

export interface DeliveryRow {
  readonly id: string;
  readonly name: string;
  readonly projectNo: string;
  readonly accountId: string;
  readonly accountName: string | null;
  readonly managerSub: string | null;
  readonly contractAmount: number | null;
  readonly currency: string;
  readonly status: string;
  readonly reported: ProjectHealth;
  readonly derived: ProjectHealth;
  /** THE PROJECT'S OWN PLAN, carried on the row rather than listed beside it.
   * `(project, sequence)` is a milestone's identity in the DDL - it is a
   * MEMBER of a project, not an object in its own right - and the flat
   * cross-project table this replaced spent its first column repeating the
   * parent's name on every row (owner, 2026-09-06). */
  readonly milestones: readonly MilestoneRow[];
}

export interface MilestoneRow {
  readonly id: string;
  readonly sequence: number;
  readonly name: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly completedAt: string | null;
}

export interface DeliveryRosterProps {
  readonly rows: readonly DeliveryRow[];
  readonly canWrite: boolean;
  /** Whether to offer the milestone form. Gated on delivery.milestone.upsert,
   * which is a different permission from the one that reconciles health. */
  readonly canPlan: boolean;
  readonly onReconcile: (
    id: string,
  ) => Promise<{ ok: boolean; changed?: boolean; error?: string }>;
}

export function DeliveryRoster({ rows, canWrite, canPlan, onReconcile }: DeliveryRosterProps) {
  const {
    DELIVERY_TEXT,
    DATA_TABLE_LABELS,
    PROJECT_ERROR,
    PROJECT_STATUS_LABEL,
    HEALTH_LABEL,
  } = useMessages();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx).
  const [selected, setSelected] = useState<readonly string[]>([]);
  // WHICH PLANS ARE OPEN. Controlled by the caller, as the DS requires when
  // expandedContent is used, because "expand everything" has to be pressable
  // from outside the table.
  const [expanded, setExpanded] = useState<readonly string[]>([]);

  const running = rows.filter(
    (r) => r.status !== "delivered" && r.status !== "closed" && r.status !== "cancelled",
  );
  const finished = rows.filter(
    (r) => r.status === "delivered" || r.status === "closed" || r.status === "cancelled",
  );

  const tone = (h: ProjectHealth) =>
    h === "red" ? "danger" : h === "amber" ? "warning" : "success";

  const columns = [
    {
      id: "name",
      header: DELIVERY_TEXT.columnNameAccount,
      cell: (r: DeliveryRow) => (
        <span className="flex min-w-0 flex-col">
          {/* 主标题字号加大加粗，副行是客户 (owner, 2026-09-06). An identifier
              is what the detail page is for; the customer is what a reader
              scans this column for. */}
          <span className="text-foreground truncate text-body-lg font-semibold">{r.name}</span>
          <Link
            href={`/account/${r.accountId}`}
            className="text-muted-foreground truncate text-body-sm hover:underline"
          >
            {r.accountName ?? r.accountId}
          </Link>
        </span>
      ),
    },
    {
      id: "manager",
      header: DELIVERY_TEXT.columnManager,
      align: "center" as const,
      // A raw subject, marked as one - dressing a machine string as a person
      // is how a UUID ends up in front of someone who then does not chase it.
      cell: (r: DeliveryRow) =>
        r.managerSub ? (
          <span className="text-muted-foreground mono truncate text-body-sm">{r.managerSub}</span>
        ) : (
          <span className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.managerNone}</span>
        ),
    },
    {
      id: "health",
      header: DELIVERY_TEXT.columnHealthStatus,
      align: "center" as const,
      cell: (r: DeliveryRow) => (
        <span className="flex flex-col items-center gap-3xs">
          <StatusBadge tone={tone(r.derived)}>
            {HEALTH_LABEL[r.derived] ?? r.derived}
          </StatusBadge>
          {worseThan(r.derived, r.reported) ? (
            <span className="text-(color:--warning-text) text-body-sm">
              {DELIVERY_TEXT.reportedAs(HEALTH_LABEL[r.reported] ?? r.reported)}
            </span>
          ) : (
            <span className="text-muted-foreground text-body-sm">
              {PROJECT_STATUS_LABEL[r.status] ?? r.status}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "contract",
      header: DELIVERY_TEXT.columnContract,
      align: "right" as const,
      cell: (r: DeliveryRow) => (
        <MoneyCell pad="0.5rem">{formatMoney(r.contractAmount, r.currency)}</MoneyCell>
      ),
    },
  ];

  const rowActions = (row: DeliveryRow) => (
    <RowActions
      disabled={pending}
      items={
        [
          // A MILESTONE BELONGS TO ONE PROJECT, so creating one is a row
          // operation (owner, 2026-09-06). In the section header it was a
          // page-level action whose form then had to ask which project - a
          // question the reader had already answered by clicking somewhere.
          // The row carries the answer in its href.
          ...(canPlan
            ? [
                {
                  id: "plan",
                  label: DELIVERY_TEXT.newMilestoneEntry,
                  onSelect: () => {
                    window.location.href = `/delivery/new?project=${encodeURIComponent(row.id)}`;
                  },
                },
              ]
            : []),
          ...(!canWrite
            ? []
            : [
              {
                id: "reconcile",
                separatorBefore: canPlan,
                label: DELIVERY_TEXT.reconcile,
                icon: "refresh" as const,
                hint: DELIVERY_TEXT.reconcileHint,
                onSelect: () =>
                  start(() => {
                    void onReconcile(row.id).then((r) => {
                      if (!r.ok) {
                        toast({
                          tone: "danger",
                          title: PROJECT_ERROR[r.error ?? "denied"] ?? PROJECT_ERROR.not_found,
                        });
                        return;
                      }
                      // THREE OUTCOMES, THREE MESSAGES. Saying "recomputed"
                      // for all of them would hide the one that matters: the
                      // report and the rows agreed, which is a different fact
                      // from having just corrected a misreport.
                      toast({
                        tone: r.changed ? "success" : "info",
                        title: r.changed
                          ? DELIVERY_TEXT.reconciledChanged
                          : DELIVERY_TEXT.reconciledSame,
                      });
                    });
                  }),
              },
            ]),
        ]
      }
    />
  );

  /* THE PLAN SITS UNDER THE PROJECT IT BELONGS TO (owner, 2026-09-06).
     A milestone is a member of a project - `(project, sequence)` is its
     identity - and it is also the EVIDENCE for the health reading on the row
     above it: deriveProjectHealth reads milestone status, and one `missed`
     overrides a manager's reported green. A verdict and its evidence belong
     on the same screen, which is the same rule the assistant panel follows.
     The DS's own expandedContent note says this beats opening a page for a
     belongs-to relationship, and leadingSpacer is what aligns the nested
     table's row head with the parent's.

     Returning null for a project with no milestones is deliberate: the DS
     then draws no chevron at all, rather than a chevron that opens nothing.

     IT OPENS AS A FLOW, NOT A TABLE (owner ruling). A plan is a sequence, and
     a table makes the reader rebuild that order in their head - see
     delivery-plan-flow.tsx. */
  const expandedContent = (row: DeliveryRow) =>
    row.milestones.length === 0 ? null : <DeliveryPlanFlow nodes={row.milestones} />;

  /* THE FIXED COLUMNS ARE FIXED AND EVERYTHING ELSE IS DIVIDED EQUALLY
     (owner, 2026-09-06). 选择 / 序号 / 操作 carry a width and no other column
     does; table-fixed hands out the remainder in equal shares by itself. */
  const table = (list: readonly DeliveryRow[], empty: ReactNode) => {
    const select = rowClickSelection(list, (r) => r.id, selected, setSelected);
    return (
      <div
        ref={select.ref}
        className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} ${select.className}`}
      >
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowKey={(r: DeliveryRow) => r.id}
          rows={[...list]}
          columns={columns}
          rowActions={rowActions}
          expandedContent={expandedContent}
          expandedKeys={expanded}
          onExpandedChange={setExpanded}
          empty={empty}
        />
      </div>
    );
  };

  return (
    <>
      <Section
        id="delivery"
        icon={moduleIcon("delivery")}
        title={DELIVERY_TEXT.rosterRunning}
        description={DELIVERY_TEXT.rosterRunningWhy}
      >
        {table(
          running,
          <EmptyState title={DELIVERY_TEXT.noProjects} description={DELIVERY_TEXT.description} />,
        )}
      </Section>

      {finished.length > 0 ? (
        <Section
          id="delivery-finished"
          icon="file-text"
          title={DELIVERY_TEXT.rosterFinished}
          description={DELIVERY_TEXT.rosterFinishedWhy}
        >
          {table(
            finished,
            <EmptyState
              title={DELIVERY_TEXT.noProjects}
              description={DELIVERY_TEXT.description}
            />,
          )}
        </Section>
      ) : null}
    </>
  );
}
