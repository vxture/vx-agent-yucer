"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Drawer,
  EmptyState,
  Icon,
  MetricListCard,
  Progress,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Grid,
  useMediaQuery,
  type FilterBarView,
} from "@vxture/design-ui";
import type { AttainmentPlan } from "../../domains/planning/attainment-plan";
import type { ExecutionRow, SupportDeal } from "../lib/attainment-progress";
import { attainmentHref, planningHref } from "../lib/attainment-workspace";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import { useMemberName } from "../lib/member-names";
import { RowActions } from "./table-fittings";
import { DataTable, FilterBar } from "./business-controls";
import { periodRange, within } from "../../domains/shared/period";
import { sumMoney } from "../../domains/shared/money";

const LINK =
  "no-underline transition-colors hover:text-primary-text focus-visible:text-primary-text";

export function ExecutionTable({
  rows,
  onSource,
  scope,
}: {
  rows: readonly ExecutionRow[];
  onSource?: (row: ExecutionRow) => void;
  scope?: string;
}) {
  const {
    ATTAINMENT_PLAN_TEXT: T,
    ATTAINMENT_TEXT: { workspace: W },
    DATA_TABLE_LABELS,
  } = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const amount = (n: number | null, r: ExecutionRow) =>
    n === null ? "-" : formatMoney(n, r.currency, locale);
  return (
    <DataTable
      leadingSpacer
      indexStart={1}
      rows={[...rows]}
      labels={DATA_TABLE_LABELS}
      rowKey={(r: ExecutionRow) => r.id}
      rowActions={(r: ExecutionRow) => (
        <RowActions
          label={`${W.period} ${r.period}`}
          items={[
            {
              id: "open",
              label: W.progress,
              onSelect: () =>
                router.push(
                  attainmentHref({ period: r.period, scope: scope ?? r.scope }),
                ),
            },
            ...(onSource
              ? [{ id: "source", label: T.source, onSelect: () => onSource(r) }]
              : []),
          ]}
        />
      )}
      columns={[
        {
          id: "period",
          header: W.period,
          cell: (r: ExecutionRow) => (
            <Link
              className={LINK}
              href={attainmentHref({
                period: r.period,
                scope: scope ?? r.scope,
              })}
            >
              {r.period}
            </Link>
          ),
        },
        {
          id: "target",
          header: T.currentTarget,
          cell: (r: ExecutionRow) => (
            <div className="whitespace-nowrap">
              <span className="font-medium tabular-nums">
                {r.target ? amount(r.target.target, r) : T.noTarget}
              </span>
              <div className="text-body-small text-muted-foreground">
                {r.target?.revision
                  ? `V${r.target.revision.version}`
                  : r.target
                    ? T.legacy
                    : "-"}
              </div>
            </div>
          ),
        },
        {
          id: "closed",
          header: T.currentClosed,
          cell: (r: ExecutionRow) => amount(r.closed, r),
        },
        {
          id: "rate",
          header: T.currentRate,
          cell: (r: ExecutionRow) =>
            r.ratio === null ? "-" : `${(r.ratio * 100).toFixed(1)}%`,
        },
        {
          id: "gap",
          header: T.currentGap,
          cell: (r: ExecutionRow) => amount(r.gap, r),
        },
      ]}
      empty={<EmptyState title={T.noPeriods} />}
    />
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
  open: controlledOpen,
  onOpenChange,
}: TargetProps) {
  const { ATTAINMENT_PLAN_TEXT: T, PLAN_VERSION_TEXT: P } = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
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
  const metrics = [
    {
      key: "target",
      label: T.currentTarget,
      value: row.target ? amount(row.target.target) : T.notSet,
    },
    { key: "closed", label: T.currentClosed, value: amount(row.closed) },
    {
      key: "rate",
      label: T.currentRate,
      value: row.ratio === null ? "-" : `${(row.ratio * 100).toFixed(1)}%`,
    },
    { key: "gap", label: T.currentGap, value: amount(row.gap) },
  ];
  return (
    <MetricListCard
      title={
        <span className="flex min-h-control-xl items-center gap-sm">
          <Icon
            name={compact ? "globe" : "flag"}
            size="md"
            className="shrink-0 text-muted-foreground"
          />
          {compact ? (
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
      metrics={compact ? metrics : undefined}
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
              {
                id: "source",
                label: T.source,
                icon: "info",
                onSelect: () => onPanel("source", row, plan),
              },
              {
                id: "support",
                label: T.support,
                icon: "users",
                onSelect: () => onPanel("support", row, plan),
              },
              {
                id: "risk",
                label: T.risk,
                icon: "warning",
                onSelect: () => onPanel("risk", row, plan),
              },
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
              ...(compact
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
              ...(canPlan && !row.scope.startsWith("owner:")
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
              className="grid grid-cols-2 gap-md @3xl:grid-cols-4"
              data-attainment-summary
            >
              {metrics.map((m, index) => (
                <MetricListCard
                  key={m.label}
                  title={m.label}
                  note={
                    <div className="flex flex-col gap-xs">
                      <span
                        className={`text-heading-2 font-semibold tabular-nums ${index === 0 ? "text-primary" : "text-foreground"}`}
                      >
                        {m.value}
                      </span>
                      {index === 0 &&
                      row.target &&
                      (row.target.floor !== null ||
                        row.target.stretch !== null) ? (
                        <span className="text-body-small text-muted-foreground">
                          {T.floor} {amount(row.target.floor)}
                          {" \u00b7 "}
                          {T.stretch} {amount(row.target.stretch)}
                        </span>
                      ) : null}
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-md gap-y-xs text-body-small text-muted-foreground">
              {row.target &&
              (row.target.floor !== null || row.target.stretch !== null) ? (
                <span>
                  {T.floor} {amount(row.target.floor)}
                  {" \u00b7 "}
                  {T.stretch} {amount(row.target.stretch)}
                </span>
              ) : null}
              <span>
                {T.commit} {amount(row.commit)}
              </span>
              <span>
                {T.coverage}{" "}
                {row.coverage === null
                  ? row.gap === 0
                    ? T.met
                    : "-"
                  : `${row.coverage.toFixed(1)}x`}
              </span>
            </div>
          )}
          {row.ratio !== null ? (
            <Progress value={Math.min(100, Math.max(0, row.ratio * 100))} />
          ) : null}
          {row.error ? (
            <p role="alert" className="text-body-small text-danger-text">
              {row.currencyConflict ? T.currencyConflict : T.loadFailed}
            </p>
          ) : !row.target ? (
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
              {" \u00b7 "}
              {T.asOf}{" "}
              {new Date(plan.observedAt).toLocaleString(locale, {
                timeZone: "UTC",
              })}{" "}
              UTC
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
                    rows={periods}
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
  report,
  supportDeals = null,
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
  report?: ReactNode;
  supportDeals?: readonly SupportDeal[] | null;
}) {
  const {
    ATTAINMENT_PLAN_TEXT: T,
    DS_LABELS,
    ATTAINMENT_TEXT: { workspace: W },
  } = useMessages();
  const locale = useLocale();
  const wide = useMediaQuery("(min-width: 96rem)");
  const [view, setView] = useState<FilterBarView>("cards");
  const [expanded, setExpanded] = useState<string[]>([]);
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
  const amount = (n: number | null, currency: string) =>
    n === null ? "-" : formatMoney(n, currency, locale);
  const toggle = (id: string) =>
    setExpanded((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
  const menu = (r: ExecutionRow) => (
    <RowActions
      label={`${r.name} ${DS_LABELS.actionMenu}`}
      items={[
        {
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
        {
          id: "periods",
          label: expanded.includes(r.id) ? T.collapse : T.expand,
          onSelect: () => toggle(r.id),
        },
      ]}
    />
  );
  return (
    <>
      {allRows ? (
        <Section icon="calendar" title={T.periods} description={T.allHint}>
          <ExecutionTable
            rows={allRows}
            scope={selectionScope}
            onSource={(r) => onPanel("source", r, plan)}
          />
        </Section>
      ) : row ? (
        <ExecutionTargetCard
          row={row}
          selectionScope={selectionScope}
          periods={periods}
          plan={plan}
          canPlan={canPlan}
          onPanel={onPanel}
        />
      ) : null}
      {report}
      {regions.length ? (
        <Section icon="map-pin" title={T.regions} description={T.regionsHint}>
          <FilterBar view={view} onViewChange={setView} />
          {view === "cards" ? (
            <Grid columns={wide ? 2 : 1} gap="md" className="items-start">
              {regions.map((r) => (
                <ExecutionTargetCard
                  key={r.id}
                  compact
                  row={r}
                  periods={regionPeriods[r.scope] ?? []}
                  plan={plan}
                  canPlan={canPlan}
                  onPanel={onPanel}
                  open={expanded.includes(r.id)}
                  onOpenChange={(open) =>
                    setExpanded((v) =>
                      open
                        ? [...new Set([...v, r.id])]
                        : v.filter((id) => id !== r.id),
                    )
                  }
                />
              ))}
            </Grid>
          ) : (
            <Table>
              <colgroup>
                <col className="w-table-col-fixed" />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col className="w-table-col-fixed" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  {[
                    "",
                    T.region,
                    T.currentTarget,
                    T.currentClosed,
                    T.currentRate,
                    T.currentGap,
                    T.commit,
                    "",
                  ].map((h, i) => (
                    <TableHead
                      key={i}
                      className={i === 0 || i === 7 ? "text-center" : ""}
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              {regions.map((r, i) => (
                <TableBody key={r.id}>
                  <TableRow
                    className={`${expanded.includes(r.id) ? "bg-accent" : ""} cursor-pointer hover:bg-transparent`}
                    tabIndex={0}
                    aria-expanded={expanded.includes(r.id)}
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
                      <Link
                        className={`${LINK} font-medium`}
                        href={attainmentHref({
                          scope: r.scope,
                          period: r.period,
                        })}
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {r.target
                        ? amount(r.target.target, r.currency)
                        : T.noTarget}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {amount(r.closed, r.currency)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.ratio === null
                        ? "-"
                        : `${(r.ratio * 100).toFixed(1)}%`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {amount(r.gap, r.currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {amount(r.commit, r.currency)}
                    </TableCell>
                    <TableCell className="text-center">{menu(r)}</TableCell>
                  </TableRow>
                  {expanded.includes(r.id) ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className="px-lg py-md">
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
                  \u00b7 {t.start} - {t.end}
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
