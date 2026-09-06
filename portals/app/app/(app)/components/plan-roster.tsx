"use client";

import { useTransition } from "react";
import {
  ActionMenu,
  Button,
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import { nextPlanStatuses, type PlanStatus } from "../../domains/strategy/lib/lifecycle";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";

// 战略计划清单 - the catalogue module's pattern, applied to plans on the
// owner's 2026-09-05 ruling. It replaces strategy-table.tsx, which was the
// last list still on the pre-migration ViewHeader + Section + FilterBar shape.
//
// TWO SECTIONS, NOT A FILTER. Running and settled plans are read for different
// reasons - one is this half-year's work, the other is the record - and the
// split is the same one every other roster here makes.
//
// NO 上移/下移 AND NO 删除, and both absences are the design rather than an
// omission. A plan is ordered by its PERIOD, which is data the row already
// carries; a manual rank would be a second, contradictable answer to "which
// half-year is this". And the store has no deletePlan at all: archiving an
// upstream record never destroys the downstream ones that point at it, so the
// way out of a plan is its lifecycle, not a delete.
//
// THE LIFECYCLE MOVES ARE ASKED, NOT LISTED. `nextPlanStatuses` owns which
// moves are legal from here; a menu that offered all five and let the machine
// refuse four teaches people the product says no for reasons they cannot
// predict.

export interface PlanRow {
  readonly id: string;
  readonly planNo: string;
  readonly name: string;
  readonly period: string;
  readonly ownerSub: string | null;
  readonly status: PlanStatus;
  /** Undefined when the reader may not see campaigns - see the cell. */
  readonly campaignCount: number | undefined;
}

export interface PlanRosterProps {
  readonly rows: readonly PlanRow[];
  readonly canEdit: boolean;
  readonly canApprove: boolean;
  readonly onMove: (id: string, to: string) => Promise<{ ok: boolean; error?: string }>;
}

export function PlanRoster({ rows, canEdit, canApprove, onMove }: PlanRosterProps) {
  const { STRATEGY_TEXT, PLAN_ERROR, PLAN_STATUS_LABEL, CATALOG_TEXT, DATA_TABLE_LABELS } =
    useMessages();
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const live = rows.filter((r) => r.status !== "closed" && r.status !== "archived");
  const settled = rows.filter((r) => r.status === "closed" || r.status === "archived");

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({ tone: "danger", title: PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied });
      });
    });

  const columns = [
    {
      id: "name",
      header: STRATEGY_TEXT.columnName,
      cell: (r: PlanRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-foreground truncate">{r.name}</span>
          <span className="text-muted-foreground mono truncate text-body-sm">{r.planNo}</span>
        </span>
      ),
    },
    {
      id: "period",
      header: STRATEGY_TEXT.columnPeriod,
      width: "sm" as const,
      align: "center" as const,
      cell: (r: PlanRow) => (
        <span className="text-muted-foreground tabular-nums text-body-sm">{r.period}</span>
      ),
    },
    {
      id: "owner",
      header: STRATEGY_TEXT.columnOwner,
      // A raw subject, marked as one - the same call every other list here makes.
      cell: (r: PlanRow) =>
        r.ownerSub ? (
          <span className="text-muted-foreground mono truncate text-body-sm">{r.ownerSub}</span>
        ) : (
          <span className="text-muted-foreground text-body-sm">{STRATEGY_TEXT.ownerNone}</span>
        ),
    },
    {
      id: "campaigns",
      header: STRATEGY_TEXT.columnCampaigns,
      width: "sm" as const,
      align: "center" as const,
      // THE PAGE'S CLAIM, MADE CHECKABLE - and three states, not two.
      // Undefined means the reader holds no campaign.view and the cell says
      // nothing; zero means the plan exists and nobody acted on it, which is
      // worth seeing rather than hiding behind a dash.
      cell: (r: PlanRow) =>
        r.campaignCount === undefined ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span
            className={`tabular-nums text-body-sm ${
              r.campaignCount === 0 && r.status === "active" ? "text-(color:--warning-text)" : ""
            }`}
          >
            {r.campaignCount}
          </span>
        ),
    },
    {
      id: "status",
      header: CATALOG_TEXT.colStatus,
      width: "sm" as const,
      align: "center" as const,
      cell: (r: PlanRow) => (
        <StatusBadge tone={r.status === "active" ? "success" : "neutral"}>
          {PLAN_STATUS_LABEL[r.status] ?? r.status}
        </StatusBadge>
      ),
    },
  ];

  const rowActions =
    canEdit || canApprove
      ? (row: PlanRow) => {
          const settledRow = row.status === "closed" || row.status === "archived";
          const moves = nextPlanStatuses(row.status).filter(
            // Approval is its own permission. Offering the move to somebody
            // who holds only strategy.plan.update would put the refusal after
            // the click instead of before it.
            (to) => (to === "approved" ? canApprove : canEdit),
          );
          return (
            <ActionMenu
              disabled={pending}
              items={[
                ...(canEdit && !settledRow
                  ? [
                      {
                        id: "edit",
                        label: CATALOG_TEXT.opEdit,
                        onSelect: () => {
                          window.location.href = `/strategy/new?no=${encodeURIComponent(row.planNo)}`;
                        },
                      },
                    ]
                  : []),
                ...moves.map((to, i) => ({
                  id: `to-${to}`,
                  label: STRATEGY_TEXT.planMoveTo(PLAN_STATUS_LABEL[to] ?? to),
                  separatorBefore: i === 0 && canEdit && !settledRow,
                  onSelect: () => run(onMove(row.id, to)),
                })),
              ]}
            />
          );
        }
      : undefined;

  /* The catalogue rosters' geometry (TD-022), COUNTED FROM THE LEFT. The
     index column is always there; the ACTION column is not - it disappears
     for a reader who can neither edit nor approve - so counting from the
     right moved every width one column over for them (review, 2026-09-05).
     Order: # | name | period | owner | campaigns | status | actions? */
  const table = (list: readonly PlanRow[]) => (
    <div className="[&_table]:table-fixed [&_thead_th:nth-child(3)]:w-[7rem] [&_thead_th:nth-child(5)]:w-[6rem] [&_thead_th:nth-child(6)]:w-[6rem] [&_thead_th:last-child]:w-control-3xl">
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        rowKey={(r: PlanRow) => r.id}
        rows={[...list]}
        columns={columns}
        rowActions={rowActions}
        empty={
          <EmptyState
            title={STRATEGY_TEXT.emptyTitle}
            description={STRATEGY_TEXT.emptyDescription}
          />
        }
      />
    </div>
  );

  return (
    <>
      <Section
        id="plans"
        icon={moduleIcon("strategy")}
        title={STRATEGY_TEXT.rosterPlan}
        description={STRATEGY_TEXT.rosterPlanWhy}
        action={
          canEdit ? (
            <Button asChild>
              <a href="/strategy/new">{STRATEGY_TEXT.newPlanEntry}</a>
            </Button>
          ) : undefined
        }
      >
        {table(live)}
      </Section>

      {settled.length > 0 ? (
        <Section
          id="plans-settled"
          icon="file-text"
          title={STRATEGY_TEXT.rosterPlanSettled}
          description={STRATEGY_TEXT.rosterPlanSettledWhy}
        >
          {table(settled)}
        </Section>
      ) : null}
    </>
  );
}
