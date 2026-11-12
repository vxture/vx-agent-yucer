"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Drawer,
  EmptyState,
  Icon,
  MetricListCard,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Grid,
  useMediaQuery,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  type FilterBarView,
} from "@vxture/design-ui";
import type { AttainmentPlan } from "../../domains/planning/attainment-plan";
import { attainmentBalance, type ExecutionRow, type SupportDeal } from "../lib/attainment-progress";
import { attainmentCoverageHref, attainmentHref, planningHref } from "../lib/attainment-workspace";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney, formatMoneyCompact } from "../lib/view-model";
import { useMemberName } from "../lib/member-names";
import { RowActions } from "./table-fittings";
import { FilterBar } from "./business-controls";
import { AttainmentProgressBar } from "./attainment-progress-bar";
import { periodRange, within } from "../../domains/shared/period";
import { sumMoney } from "../../domains/shared/money";

const LINK =
  "no-underline transition-colors hover:text-primary-text focus-visible:text-primary-text";

function Balance({
  row,
  label = false,
  prefix = true,
}: {
  row: ExecutionRow;
  label?: boolean;
  prefix?: boolean;
}) {
  const { ATTAINMENT_PLAN_TEXT: T } = useMessages();
  const locale = useLocale();
  const balance = attainmentBalance(row);
  return (
    <span
      className={`whitespace-nowrap tabular-nums ${balance.kind === "excess" ? "text-primary" : balance.amount ? "text-destructive-text" : "text-muted-foreground"}`}
    >
      {label
        ? `${balance.kind === "excess" ? T.excess : T.currentGap} `
        : balance.kind === "excess" && prefix
          ? `${T.excess} `
          : ""}
      {balance.amount === null
        ? "-"
        : formatMoney(balance.amount, row.currency, locale)}
    </span>
  );
}

function CoverageNote({ row }: { row: ExecutionRow }) {
  const { ATTAINMENT_PLAN_TEXT: T } = useMessages();
  if (row.coverage === null || !row.gap) return null;
  const multiple = row.coverage.toFixed(1);
  const description = T.coveragePlain(multiple);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={description}
          className="text-body-small font-normal tabular-nums text-muted-foreground cursor-help"
        >
          {multiple}x
        </span>
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}

// The same three business columns are used by company, region and period rows.
function ExecutionMetricCells({ row }: { row: ExecutionRow }) {
  const { ATTAINMENT_PLAN_TEXT: T } = useMessages();
  const locale = useLocale();
  const money = (n: number | null) => formatMoney(n, row.currency, locale);
  return (
    <>
      <TableCell data-execution-cell="progress">
        <div className="flex min-w-0 flex-col gap-sm">
          <span className="flex flex-wrap items-baseline justify-end gap-x-xs gap-y-2xs tabular-nums"
            title={`${T.currentClosed} ${money(row.closed)} / ${T.currentTarget} ${row.target ? money(row.target.target) : T.noTarget}`}>
            <span className="font-medium">{money(row.closed)}</span>
            <span className="text-body-small text-muted-foreground">/ {row.target ? money(row.target.target) : T.noTarget}</span>
          </span>
          <AttainmentProgressBar row={row} />
        </div>
      </TableCell>
      <TableCell data-execution-cell="reserve">
        <div className="flex flex-col items-end gap-xs whitespace-nowrap tabular-nums">
          <span className="font-medium">{money(row.open)}</span>
          <span className="inline-flex items-baseline gap-xs text-body-small text-muted-foreground">
            {T.coverageMultiple} {row.coverage === null ? row.gap === 0 ? T.met : "-" : <CoverageNote row={row} />}
          </span>
        </div>
      </TableCell>
      <TableCell data-execution-cell="balance">
        <div className="flex flex-col items-end gap-xs whitespace-nowrap tabular-nums">
          <span className="inline-flex items-baseline gap-sm font-medium"><Balance row={row} label /><CoverageNote row={row} /></span>
          <span className="text-body-small text-muted-foreground">{T.attainmentRatio} {row.ratio === null ? "-" : `${(row.ratio * 100).toFixed(1)}%`}</span>
        </div>
      </TableCell>
    </>
  );
}

export function ExecutionTable({
  rows,
  onSource,
  scope,
  overallId,
}: {
  rows: readonly ExecutionRow[];
  onSource?: (row: ExecutionRow) => void;
  scope?: string;
  overallId?: string;
}) {
  const {
    ATTAINMENT_PLAN_TEXT: T,
    ATTAINMENT_TEXT: { workspace: W },
  } = useMessages();
  const router = useRouter();
  return (
    <Table className="min-w-panel-lg" data-execution-table>
      <colgroup>
        <col className="w-table-col-fixed" />
        <col />
        <col className="w-2/5" />
        <col />
        <col />
        <col className="w-table-col-fixed" />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead className="text-center" />
          <TableHead>{W.period}</TableHead>
          <TableHead>{T.progressCard}</TableHead>
          <TableHead className="text-right">{T.reserveCard}</TableHead>
          <TableHead className="text-right">{T.balanceCard}</TableHead>
          <TableHead className="text-center" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow
            key={r.id}
            data-execution-period={r.period}
            title={`${r.period} \u00b7 ${r.target?.revision ? `V${r.target.revision.version}` : T.legacy} \u00b7 ${r.currency}`}
            className="hover:bg-transparent"
          >
            <TableCell className="text-center text-muted-foreground">
              {r.id === overallId ? "" : overallId ? i : i + 1}
            </TableCell>
            <TableCell>
              {r.scope === "unallocated" ? <span>{r.period}</span> : <Link
                className={`${LINK} whitespace-nowrap ${r.id === overallId ? "font-semibold" : ""}`}
                href={attainmentHref({
                  period: r.period,
                  scope: scope ?? r.scope,
                })}
              >
                {r.id === overallId ? T.periodOverall : r.period}
              </Link>}
            </TableCell>
            <ExecutionMetricCells row={r} />
            <TableCell className="text-center">
              <RowActions
                label={`${W.period} ${r.period}`}
                items={r.scope === "unallocated" ? [] : [
                  {
                    id: "open",
                    label: W.progress,
                    onSelect: () =>
                      router.push(
                        attainmentHref({
                          period: r.period,
                          scope: scope ?? r.scope,
                        }),
                      ),
                  },
                  ...(onSource
                    ? [
                        {
                          id: "source",
                          label: T.source,
                          onSelect: () => onSource(r),
                        },
                      ]
                    : []),
                ]}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

type TargetProps = {
  row: ExecutionRow;
  selectionScope?: string;
  periods: readonly ExecutionRow[];
  plan: AttainmentPlan;
  canPlan: boolean;
  onPanel: (
    panel: "source" | "support" | "risk",
    row: ExecutionRow,
    plan: AttainmentPlan,
  ) => void;
  compact?: boolean;
  initiallyOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ExecutionTargetCard({
  row,
  selectionScope,
  periods,
  plan,
  canPlan,
  onPanel,
  compact = false,
  initiallyOpen = false,
  open: controlledOpen,
  onOpenChange,
}: TargetProps) {
  const { ATTAINMENT_PLAN_TEXT: T, PLAN_VERSION_TEXT: P } = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(initiallyOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const amount = (n: number | null) =>
    n === null ? "-" : formatMoney(n, row.currency, locale);
  const planning = planningHref(
    plan.year,
    row.target?.revision && row.scope.startsWith("territory:")
      ? row.scope.slice(10)
      : null,
    row.target?.revision?.id,
    row.target?.revision ? row.period : null,
  );
  const coverageLink = attainmentCoverageHref({ period: row.period, scope: selectionScope === "personal" ? "personal" : row.scope });
  const unallocated = row.scope === "unallocated";
  const coverageNote = <CoverageNote row={row} />;
  const metrics = [
    {
      key: "target",
      label: unallocated ? T.unallocatedTarget : T.currentTarget,
      value: row.target ? amount(row.target.target) : T.notSet,
    },
    { key: "closed", label: T.currentClosed, value: amount(row.closed) },
    {
      key: "rate",
      label: T.currentRate,
      value: row.ratio === null ? "-" : `${(row.ratio * 100).toFixed(1)}%`,
    },
    {
      key: "gap",
      label: attainmentBalance(row).kind === "excess" ? T.excess : T.currentGap,
      value: <Balance row={row} prefix={false} />,
    },
  ];
  return (
    <MetricListCard
      title={
        <span className="flex min-h-control-xl items-center gap-sm">
          <Icon
            name={compact ? row.scope.startsWith("owner:") ? "user" : "globe" : "flag"}
            size="md"
            className="shrink-0 text-muted-foreground"
          />
          {compact && !unallocated ? (
            <Link
              className={LINK}
              href={attainmentHref({ period: row.period, scope: row.scope })}
            >
              {row.name}
            </Link>
          ) : (
            <span>{row.name}</span>
          )}
          <span className="text-body-small font-normal text-muted-foreground">
            {row.period}
          </span>
        </span>
      }
      actions={
        <div className="flex items-center gap-sm">
          <span className="whitespace-nowrap text-body-small text-muted-foreground">
            {row.target?.revision
              ? `V${row.target.revision.version}`
              : row.target
                ? T.legacy
                : T.noTarget}{" "}
            {" \u00b7 "}
            {row.currency}
          </span>
          <RowActions
            label={`${row.name} ${T.source}`}
            items={[
              ...(!unallocated ? [{
                id: "source",
                label: T.source,
                icon: "info" as const,
                onSelect: () => onPanel("source", row, plan),
              },
              {
                id: "support",
                label: T.support,
                icon: "users" as const,
                onSelect: () => onPanel("support", row, plan),
              },
              {
                id: "risk",
                label: T.risk,
                icon: "warning" as const,
                onSelect: () => onPanel("risk", row, plan),
              },
              {
                id: "coverage",
                label: T.coveragePage,
                icon: "chart-bar" as const,
                onSelect: () => router.push(coverageLink),
              }] : []),
              ...(periods.length
                ? [
                    {
                      id: "periods",
                      label: open ? T.collapse : T.expand,
                      icon: "calendar" as const,
                      onSelect: () => setOpen(!open),
                    },
                  ]
                : []),
              ...(compact && !unallocated
                ? [
                    {
                      id: "region",
                      label: T.openRegion,
                      icon: "arrow-right" as const,
                      onSelect: () =>
                        router.push(
                          attainmentHref({
                            period: row.period,
                            scope: row.scope,
                          }),
                        ),
                    },
                  ]
                : []),
              ...(canPlan && !unallocated && !row.scope.startsWith("owner:")
                ? [
                    {
                      id: "plan",
                      label: T.planning,
                      icon: "external-link" as const,
                      onSelect: () => router.push(planning),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      }
      footer={
        <div className="@container flex w-full min-w-0 flex-col gap-md">
          {!compact ? (
            <div
              className="grid grid-cols-1 gap-md @xl:grid-cols-2 @3xl:grid-cols-4"
              data-attainment-summary
            >
              {metrics.map((m) => (
                <MetricListCard
                  key={m.key}
                  title={
                    <span className="flex items-center gap-md">
                      <Icon name={m.key === "target" ? "coins" : m.key === "closed" ? "chart-line" : m.key === "rate" ? "gauge" : "scales"} size="xl" className="shrink-0 text-muted-foreground" />
                      <span className="flex min-w-0 flex-1 flex-col gap-sm">
                        <span className="whitespace-nowrap">{m.label}</span>
                        <span className={`inline-flex items-baseline gap-sm whitespace-nowrap text-heading-2 font-semibold tabular-nums ${m.key === "target" ? "text-primary" : "text-foreground"}`}>
                          {m.value}{m.key === "gap" ? coverageNote : null}
                        </span>
                        {m.key === "target" && row.target ? (
                          <span className="text-body-small font-normal text-muted-foreground" title={`${T.floor} ${amount(row.target.floor)} / ${T.stretch} ${amount(row.target.stretch)}`}>
                            {T.floor} {formatMoneyCompact(row.target.floor, row.currency, locale)}{" \u00b7 "}{T.stretch} {formatMoneyCompact(row.target.stretch, row.currency, locale)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  }
                />
              ))}
            </div>
          ) : (
            <>
              <div
                className="grid grid-cols-4 gap-sm px-lg"
                data-region-metrics
              >
                {metrics.map((m) => (
                  <div key={m.key} className="flex min-w-0 flex-col gap-xs">
                    <span className="whitespace-nowrap font-semibold tabular-nums">
                      {m.value}
                    </span>
                    <span className="inline-flex items-baseline gap-xs whitespace-nowrap text-body-small text-muted-foreground">
                      {m.label}
                      {m.key === "gap" ? coverageNote : null}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {compact ? <AttainmentProgressBar row={row} details /> : null}
          {unallocated ? (
            <p className="text-body-small text-muted-foreground">{T.unallocatedHint}</p>
          ) : null}
          {row.allocationExcess ? (
            <p role="status" className="text-body-small text-danger-text">{T.allocationExcess} {amount(row.allocationExcess)}</p>
          ) : null}
          {row.error ? (
            <p role="alert" className="text-body-small text-danger-text">
              {row.currencyConflict ? T.currencyConflict : T.loadFailed}
            </p>
          ) : !row.target && !unallocated ? (
            <p className="text-body-small text-muted-foreground">
              {row.scope.startsWith("owner:")
                ? `${T.noPersonal} \u00b7 ${T.noPersonalHint}`
                : row.period.startsWith("Y")
                  ? T.none
                  : T.quarterHint}
            </p>
          ) : null}
          {!compact ? (
            <p className="text-body-small text-muted-foreground">
              {T.currentBasis}
            </p>
          ) : null}
          {periods.length ? (
            <div className="border-t border-dashed border-border pt-sm">
              <Button
                size="xl"
                variant="ghost"
                className="w-full justify-between"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                <span
                  className={
                    open
                      ? "font-medium"
                      : "text-body-small font-normal text-muted-foreground"
                  }
                >
                  {T.periods}
                  {!open ? ` \u00b7 ${P.splitPeriods(periods.length)}` : ""}
                </span>
                <Icon name={open ? "chevron-up" : "chevron-down"} size="sm" />
              </Button>
              {open ? (
                <div className="pt-sm">
                  <ExecutionTable
                    rows={!compact ? [row, ...periods] : periods}
                    overallId={!compact ? row.id : undefined}
                    scope={selectionScope}
                    onSource={(r) => onPanel("source", r, plan)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      }
    />
  );
}

export function AttainmentTargets({
  row,
  periods,
  regions,
  regionPeriods,
  plan,
  plans = [plan],
  canPlan,
  allRows,
  selectionScope,
  supportDeals = null,
  expandPeriods = false,
  groupKind = "region",
}: {
  row: ExecutionRow | null;
  periods: readonly ExecutionRow[];
  regions: readonly ExecutionRow[];
  regionPeriods: Record<string, ExecutionRow[]>;
  plan: AttainmentPlan;
  plans?: readonly AttainmentPlan[];
  canPlan: boolean;
  allRows?: readonly ExecutionRow[];
  selectionScope: string;
  supportDeals?: readonly SupportDeal[] | null;
  expandPeriods?: boolean;
  groupKind?: "region" | "member";
}) {
  const {
    ATTAINMENT_PLAN_TEXT: T,
    DS_LABELS,
    ATTAINMENT_TEXT: { workspace: W },
  } = useMessages();
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 96rem)");
  const [view, setView] = useState<FilterBarView>(
    groupKind === "member" ? "list" : "cards",
  );
  const [listExpanded, setListExpanded] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const isExpanded = (id: string) =>
    view === "list"
      ? listExpanded.includes(id)
      : expandPeriods
        ? !collapsed.includes(id)
        : expanded.includes(id);
  const changeExpanded = (id: string, open: boolean) => {
    const set =
      view === "list"
        ? setListExpanded
        : expandPeriods
          ? setCollapsed
          : setExpanded;
    const present = view === "cards" && expandPeriods ? !open : open;
    set((keys) =>
      present ? [...new Set([...keys, id])] : keys.filter((key) => key !== id),
    );
  };
  const [panel, setPanel] = useState<{
    kind: "source" | "support" | "risk";
    row: ExecutionRow;
    plan: AttainmentPlan;
  } | null>(null);
  const onPanel: TargetProps["onPanel"] = (kind, r, p) =>
    setPanel({
      kind,
      row: r,
      plan:
        plans.find(
          (plan) =>
            plan.year === Number(r.period.replace(/^Y/, "").slice(0, 4)),
        ) ?? p,
    });
  const toggle = (id: string) => changeExpanded(id, !isExpanded(id));
  const menu = (r: ExecutionRow) => (
    <RowActions
      label={`${r.name} ${DS_LABELS.actionMenu}`}
      items={[
        ...(r.scope !== "unallocated" ? [{
          id: "source",
          label: T.source,
          onSelect: () => onPanel("source", r, plan),
        },
        {
          id: "support",
          label: T.support,
          onSelect: () => onPanel("support", r, plan),
        },
        { id: "risk", label: T.risk, onSelect: () => onPanel("risk", r, plan) },
        { id: "coverage", label: T.coveragePage, onSelect: () => router.push(attainmentCoverageHref({ period: r.period, scope: r.scope })) }] : []),
        {
          id: "periods",
          label: isExpanded(r.id) ? T.collapse : T.expand,
          onSelect: () => toggle(r.id),
        },
      ]}
    />
  );
  return (
    <>
      {allRows ? (
        <Section
          icon="calendar"
          title={`${allRows[0]?.name ?? T.periods} \u00b7 Y${plan.year}`}
          description={T.allHint}
        >
          <ExecutionTable
            rows={allRows}
            scope={selectionScope}
            onSource={(r) => onPanel("source", r, plan)}
          />
        </Section>
      ) : row ? (
        <ExecutionTargetCard
          key={`${row.id}|${expandPeriods}`}
          row={row}
          selectionScope={selectionScope}
          periods={periods}
          plan={plan}
          canPlan={canPlan}
          onPanel={onPanel}
          initiallyOpen={expandPeriods}
        />
      ) : null}
      {regions.length ? (
        <Section
          icon={groupKind === "member" ? "users" : "map-pin"}
          title={groupKind === "member" ? T.teamTitle : T.regions}
          description={groupKind === "member" ? T.teamHint : T.regionsHint}
        >
          <FilterBar
            view={view}
            onViewChange={setView}
            actions={
              view === "list" ? (
                <div className="flex items-center gap-sm text-body-small text-muted-foreground">
                  <span>
                    {groupKind === "member"
                      ? T.memberBasis
                      : plan.current
                        ? `V${plan.current.version}`
                        : T.legacy}
                    {" \u00b7 "}
                    {regions[0]?.currency}
                  </span>
                  <RowActions
                    label={groupKind === "member" ? T.teamTitle : T.regions}
                    items={[]}
                  />
                </div>
              ) : undefined
            }
          />
          {view === "cards" ? (
            <Grid columns={wide ? 2 : 1} gap="md" className="items-start">
              {regions.map((r) => (
                <div key={r.id} data-execution-card={r.scope}>
                <ExecutionTargetCard
                  compact
                  row={r}
                  periods={regionPeriods[r.scope] ?? []}
                  plan={plan}
                  canPlan={canPlan}
                  onPanel={onPanel}
                  open={isExpanded(r.id)}
                  onOpenChange={(open) => changeExpanded(r.id, open)}
                />
                </div>
              ))}
            </Grid>
          ) : (
            <Table className="min-w-panel-lg" data-execution-regions>
              <colgroup>
                <col className="w-table-col-fixed" />
                <col />
                <col className="w-2/5" />
                <col />
                <col />
                <col className="w-table-col-fixed" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center" />
                  <TableHead>{groupKind === "member" ? T.member : T.region}</TableHead>
                  <TableHead>{T.progressCard}</TableHead>
                  <TableHead className="text-right">{T.reserveCard}</TableHead>
                  <TableHead className="text-right">{T.balanceCard}</TableHead>
                  <TableHead className="text-center" />
                </TableRow>
              </TableHeader>
              {regions.map((r, i) => (
                <TableBody key={r.id}>
                  <TableRow
                    className={`${isExpanded(r.id) ? "bg-accent" : ""} cursor-pointer hover:bg-transparent`}
                    tabIndex={0}
                    aria-expanded={isExpanded(r.id)}
                    onClick={(e) => {
                      if (
                        !(e.target as HTMLElement).closest("button,a") &&
                        !window.getSelection()?.toString()
                      )
                        toggle(r.id);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.target === e.currentTarget &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        toggle(r.id);
                      }
                    }}
                  >
                    <TableCell className="text-center tabular-nums">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      {r.scope === "unallocated" ? <span className="font-medium" title={T.unallocatedHint}>{r.name}</span> : <Link
                        className={`${LINK} font-medium`}
                        href={attainmentHref({
                          scope: r.scope,
                          period: r.period,
                        })}
                      >
                        {r.name}
                      </Link>}
                      {r.subtitle ? (
                        <p className="text-body-small text-muted-foreground">
                          {r.subtitle}
                        </p>
                      ) : null}
                    </TableCell>
                    <ExecutionMetricCells row={r} />
                    <TableCell className="text-center">{menu(r)}</TableCell>
                  </TableRow>
                  {isExpanded(r.id) ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="px-lg py-md">
                        {regionPeriods[r.scope]?.length ? (
                          <ExecutionTable
                            rows={regionPeriods[r.scope]}
                            onSource={(r) => onPanel("source", r, plan)}
                          />
                        ) : (
                          <p className="text-body-small text-muted-foreground">
                            {T.noPeriods}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              ))}
            </Table>
          )}
        </Section>
      ) : null}
      <Drawer
        open={!!panel}
        onClose={() => setPanel(null)}
        width="md"
        title={
          panel?.kind === "support"
            ? T.support
            : panel?.kind === "risk"
              ? T.risk
              : T.source
        }
        description={
          panel ? `${panel.row.name} \u00b7 ${panel.row.period}` : undefined
        }
        closeLabel={DS_LABELS.confirmCancel}
      >
        {panel ? (
          <AttainmentSourceContent
            panel={panel}
            canPlan={canPlan}
            selectionScope={selectionScope}
            supportDeals={supportDeals}
          />
        ) : null}
      </Drawer>
    </>
  );
}

function AttainmentSourceContent({
  panel,
  canPlan,
  selectionScope,
  supportDeals,
}: {
  panel: {
    kind: "source" | "support" | "risk";
    row: ExecutionRow;
    plan: AttainmentPlan;
  };
  canPlan: boolean;
  selectionScope: string;
  supportDeals: readonly SupportDeal[] | null;
}) {
  const {
    ATTAINMENT_PLAN_TEXT: T,
    ATTAINMENT_TEXT: { workspace: W },
  } = useMessages();
  const locale = useLocale();
  const nameOf = useMemberName();
  const { row, plan, kind } = panel;
  const amount = (n: number | null) =>
    n === null ? T.notSet : formatMoney(n, row.currency, locale);
  const planning = planningHref(
    Number(row.period.replace(/^Y/, "").slice(0, 4)),
    row.target?.revision && row.scope.startsWith("territory:")
      ? row.scope.slice(10)
      : null,
    row.target?.revision?.id,
    row.target?.revision ? row.period : null,
  );
  if (kind === "risk")
    return (
      <div className="flex flex-col gap-md text-body-small">
        <p className="text-muted-foreground">{T.coverageHint}</p>
        <dl className="grid grid-cols-2 gap-md">
          {[
            [T.currentGap, amount(row.gap)],
            [T.commit, amount(row.commit)],
            [
              T.commitGap,
              amount(
                row.gap === null || row.commit === null
                  ? null
                  : Math.max(0, row.gap - row.commit),
              ),
            ],
            [
              T.coverage,
              row.coverage === null
                ? row.gap === 0
                  ? T.met
                  : "-"
                : `${row.coverage.toFixed(1)}x`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {row.undated ? (
          <p className="text-warning-text">
            {T.dateMissing} ({row.undated})
          </p>
        ) : null}
        {row.error ? (
          <p role="alert" className="text-danger-text">
            {row.currencyConflict ? T.currencyConflict : T.loadFailed}
          </p>
        ) : null}
        <Button asChild size="xl" variant="outline">
          <Link
            href={attainmentHref({
              period: row.period,
              scope: selectionScope === "personal" ? selectionScope : row.scope,
              view: "review",
            })}
          >
            {W.review}
          </Link>
        </Button>
      </div>
    );
  if (kind === "source")
    return (
      <div className="flex flex-col gap-lg">
        <p className="text-body-small text-muted-foreground">{T.sourceHint}</p>
        <dl className="grid grid-cols-2 gap-x-lg gap-y-md text-body-small">
          {[
            [
              T.current,
              row.target?.revision
                ? `V${row.target.revision.version}`
                : row.target
                  ? T.legacy
                  : T.none,
            ],
            [
              T.currentTarget,
              row.target ? amount(row.target.target) : T.notSet,
            ],
            [T.floor, amount(row.target?.floor ?? null)],
            [T.stretch, amount(row.target?.stretch ?? null)],
            [
              T.baseline,
              row.target?.baseline == null
                ? T.notSet
                : `${plan.baseline ? `V${plan.baseline.version} \u00b7 ` : ""}${amount(row.target.baseline)}`,
            ],
            [
              T.effectiveAt,
              row.target?.revision
                ? `${new Date(row.target.revision.effectiveAt).toLocaleString(locale, { timeZone: "UTC" })} UTC`
                : "-",
            ],
            [
              T.asOf,
              `${new Date(plan.observedAt).toLocaleString(locale, { timeZone: "UTC" })} UTC`,
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-xs">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {row.target && !row.target.baselineComparable ? (
          <p className="text-body-small text-warning-text">
            {T.boundaryChanged}
          </p>
        ) : null}
        {canPlan && !row.scope.startsWith("owner:") ? (
          <Button asChild size="xl" variant="outline">
            <Link href={planning}>{T.planning}</Link>
          </Button>
        ) : null}
      </div>
    );
  const personal = row.scope.startsWith("owner:") ? row.scope.slice(6) : null;
  const regionId = row.scope.startsWith("territory:")
    ? row.scope.slice(10)
    : null;
  const targetKeys = new Set(
    plan.targets
      .filter(
        (t) =>
          (row.scope === "workspace" || t.scope === row.scope) &&
          t.period === row.period,
      )
      .map((t) => t.key),
  );
  const contributions = plan.support.contributions.filter(
    (c) =>
      !personal &&
      (!regionId || c.regionId === regionId) &&
      targetKeys.has(c.targetKey),
  );
  const budgets = contributions
    .map((c) => ({
      contribution: c,
      budget: plan.support.budgets.find((b) => b.key === c.budgetKey),
    }))
    .filter((c) => c.budget);
  const range = periodRange(row.period);
  const team = plan.support.team.filter(
    (t) =>
      (!personal || t.memberSub === personal) &&
      (!regionId || t.regionId === regionId) &&
      !!range &&
      new Date(t.start) < range.end &&
      new Date(t.end) > range.start,
  );
  const actions = plan.support.actions.filter(
    (a) =>
      (!personal || a.ownerSub === personal) &&
      (!regionId || a.regionId === regionId) &&
      (a.targetKey && !personal
        ? targetKeys.has(a.targetKey)
        : !!range && within(range, new Date(a.due))),
  );
  const memberCount = new Set(
    team.flatMap((t) => (t.memberSub ? [t.memberSub] : [])),
  ).size;
  const actualFor = (accountId: string, region: string, currency: string) => {
    if (!supportDeals || !range) return null;
    const amounts = supportDeals.flatMap((d) =>
      d.accountId === accountId &&
      d.territoryId === region &&
      within(range, d.closedAt ?? null) &&
      d.amount
        ? [d.amount]
        : [],
    );
    const sum = sumMoney(amounts, currency);
    return sum.ok ? sum.value.amount : null;
  };
  return (
    <div className="flex flex-col gap-lg">
      <p className="text-body-small text-muted-foreground">{T.supportHint}</p>
      {plan.supportRestricted ? (
        <p className="text-body-small text-muted-foreground">{T.restricted}</p>
      ) : null}
      <Section icon="buildings" title={T.customers} description={T.budgetHint}>
        {budgets.length ? (
          <div className="flex flex-col gap-md">
            {budgets.map(({ contribution: c, budget: b }) => {
              const currency = b!.currency ?? row.currency;
              const actual = actualFor(b!.accountId, c.regionId, currency);
              return (
                <div
                  key={c.key}
                  className="flex flex-col gap-xs border-b border-dashed border-border pb-sm"
                >
                  <Link
                    className={LINK}
                    href={`/account/${encodeURIComponent(b!.accountId)}`}
                  >
                    {b!.name}
                  </Link>
                  <div className="flex flex-wrap gap-x-md text-body-small tabular-nums">
                    <span>
                      {T.planAmount}{" "}
                      {formatMoney(Number(c.amount), currency, locale)}
                    </span>
                    <span>
                      {T.actualAmount}{" "}
                      {actual === null
                        ? "-"
                        : formatMoney(actual, currency, locale)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-body-small text-muted-foreground">{T.noSupport}</p>
        )}
      </Section>
      <Section
        icon="users"
        title={T.team}
        description={team.length ? `${T.people} ${memberCount}` : undefined}
      >
        {team.length ? (
          <div className="flex flex-col gap-md">
            {team.map((t) => (
              <div
                key={t.key}
                className="flex flex-wrap items-center justify-between gap-sm border-b border-dashed border-border pb-sm"
              >
                <span>
                  {t.memberSub
                    ? (nameOf(t.memberSub) ?? t.memberName)
                    : T.requested}{" "}
                  {" \u00b7 "}
                  {t.role}
                </span>
                <span className="text-body-small text-muted-foreground">
                  {t.memberSub ? `${t.percent}%` : `${t.requestedFte} FTE`}{" "}
                  {"\u00b7"} {t.start} - {t.end}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-small text-muted-foreground">{T.noSupport}</p>
        )}
      </Section>
      <Section icon="list-checks" title={T.actions}>
        {actions.length ? (
          <div className="flex flex-col gap-md">
            {actions.map((a) => (
              <div
                key={a.key}
                className="flex flex-col gap-xs border-b border-dashed border-border pb-md"
              >
                <span className="font-medium">{a.objective}</span>
                <span className="text-body-small text-muted-foreground">
                  {T.owner} {a.ownerSub ? (nameOf(a.ownerSub) ?? "-") : "-"}{" "}
                  {"\u00b7"} {T.due} {a.due || "-"}
                </span>
                {a.accountId ? (
                  <Link
                    className={`${LINK} text-body-small`}
                    href={`/account/${encodeURIComponent(a.accountId)}`}
                  >
                    {T.viewEvidence}
                  </Link>
                ) : null}
                <p className="text-body-small text-muted-foreground">
                  {a.evidenceRefs.length
                    ? `${T.evidence}: ${a.evidenceRefs.join(" \u00b7 ")}`
                    : T.noEvidence}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-small text-muted-foreground">{T.noSupport}</p>
        )}
      </Section>
    </div>
  );
}
