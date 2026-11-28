"use client";
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Drawer,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  NativeSelect,
  SegmentedControl,
} from "@vxture/design-system";
import type { AttainmentAnalysis } from "./analysis-board";
import type { AttainmentScreen } from "../lib/attainment-pages";
import { attainmentCopy } from "./copy";
import { useLocale } from "../lib/i18n/provider";
import { planningHref } from "../lib/attainment-workspace";
import styles from "./workspace.module.css";
import { Discuss } from "./widgets";
import { makeAnalysisRow } from "./analysis-row";
import { customerGoalSummary } from "./goal-model";
import { personalPending } from "./personal-model";
import { dealMatches, selectedDeals } from "../../domains/pipeline/lib/attainment-analysis";
import { dealDiagnosis } from "./deal-diagnosis";
import { periodPhase } from "./progress-model";
import { moneyScale } from "./format";
import { ViewHeader } from "../components/business-controls";

export function AttainmentWorkspaceHeader({
  data,
  screen,
  scope,
  name,
  metric,
  filter,
  teamView = "amount",
  reports = [],
  snapshot,
}: {
  data: AttainmentAnalysis;
  screen: AttainmentScreen;
  scope: string;
  name: string;
  metric: string;
  filter: string;
  teamView?: string;
  reports?: { key: string; label: string }[];
  snapshot?: string | null;
}) {
  const locale = useLocale(),
    T = attainmentCopy(locale),
    router = useRouter(),
    params = useSearchParams();
  const [pending, start] = useTransition(),
    [drawer, setDrawer] = useState<"source" | "versions" | null>(null);
  const push = (patch: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    q.delete("snapshot");
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    start(() => router.push(`/attainment?${q}`, { scroll: false }));
  };
  const year = data.year,
    years = [
      ...new Set([
        year,
        new Date(data.observedAt).getUTCFullYear(),
        ...(data.years ?? []),
        year - 1,
        year + 1,
      ]),
    ].sort((a, b) => b - a);
  const periodPart = /Q[1-4]$/.test(data.period)
    ? data.period.slice(-2)
    : "year";
  const title =
    screen === "region"
      ? `${name}${locale.startsWith("zh") ? "\u8fbe\u6210" : " attainment"}`
      : T[screen];
  const row = makeAnalysisRow(data, scope, name),
    goals = customerGoalSummary(data, scope),
    units = moneyScale(locale, row.currency);
  const regionWon = data.regions.map(
    (r) => makeAnalysisRow(data, `territory:${r.id}`, r.name).closed.value,
  );
  const unassigned =
    row.closed.value !== null && regionWon.every((v) => v !== null)
      ? row.closed.value - regionWon.reduce<number>((n, v) => n + v!, 0)
      : null;
  const activeMembers = data.members.filter(
    (m) =>
      m.sub === data.self ||
      data.targets?.some((t) => t.scope === `owner:${m.sub}`) ||
      data.deals?.some((d) => d.ownerSub === m.sub),
  );
  const pendingCount = screen === "mine" ? personalPending(data)?.total ?? T.unknown
    : periodPhase(data.period, data.observedAt) === "ended" || !data.deals ? T.unknown
      : [...new Map([...selectedDeals(data.deals, scope, data.period), ...data.deals.filter((d) => dealMatches(d, scope) && d.status === "open" && !d.expectedCloseAt)].map((d) => [d.id, d])).values()]
        .filter((d) => dealDiagnosis(d, data.observedAt, data.review?.[d.id]).issues.length).length;
  const summary =
    screen === "customers"
      ? `${goals.accounts} ${T.accountsUnit} \u00b7 ${goals.total} ${T.goalsUnit} \u00b7 ${T.unverified} ${goals.unverified}`
      : screen === "company" || screen === "regions"
        ? `${data.regions.length} ${T.regionUnit}${unassigned !== null && unassigned > 0 ? ` \u00b7 ${T.unassigned} ${(unassigned / units.divisor).toLocaleString(locale)} ${units.label}` : ""}`
        : screen === "team"
          ? `${activeMembers.length} ${T.owner} \u00b7 ${T.noTarget} ${activeMembers.filter((m) => !data.targets?.some((t) => t.scope === `owner:${m.sub}` && t.period === data.period && t.metric === "revenue")).length}`
          : screen === "forecast" || screen === "history"
            ? `${name} \u00b7 ${data.period}${reports.length ? ` \u00b7 ${T.history} ${reports.length}` : ""}`
            : `${row.target ? `${T.target} ${(row.target.target / units.divisor).toLocaleString(locale)} ${units.label}` : T.noTarget} \u00b7 ${T.pendingItems} ${pendingCount}`;
  return (
    <>
      <ViewHeader
        icon={
          screen === "company"
            ? "building-office"
            : screen === "customers"
              ? "flag"
              : screen === "region"
                ? "map-pin"
                : screen === "team"
                  ? "users"
                  : screen === "mine"
                    ? "user"
                    : screen === "history"
                      ? "clock-counter-clockwise"
                      : screen === "forecast"
                        ? "chart-line-up"
                        : "chart-bar"
        }
        title={title}
        description={
          <span className="text-body-small text-muted-foreground">
            {summary}
            {data.revision && data.current?.id !== data.revision.id
              ? ` \u00b7 ${T.historical}`
              : ""}
          </span>
        }
        pageActions={{
          context: (
            <div
              className="flex flex-wrap items-center justify-end gap-sm"
              aria-busy={pending}
              data-control-size="preserve"
            >
              {screen === "team" ? (
                <SegmentedControl
                  size="md"
                  value={teamView}
                  onChange={(value) => push({ teamView: value })}
                  items={[
                    { value: "amount", label: T.amountView },
                    { value: "rate", label: T.rateView },
                  ]}
                  ariaLabel={T.attainment}
                />
              ) : null}
              {screen === "regions" ? (
                <SegmentedControl
                  size="md"
                  value={metric}
                  onChange={(value) => push({ metric: value })}
                  items={["revenue", "pipeline", "new_logo", "margin"].map(
                    (key) => ({ value: key, label: T[key as "revenue"] }),
                  )}
                  ariaLabel={T.target}
                />
              ) : null}
              {screen === "customers" || screen === "mine" ? (
                <SegmentedControl
                  size="md"
                  value={filter}
                  onChange={(value) => push({ filter: value })}
                  items={
                    screen === "customers"
                      ? [
                          { value: "all", label: T.all },
                          { value: "attention", label: T.attention },
                          { value: "unverified", label: T.unverified },
                        ]
                      : [
                          { value: "all", label: T.all },
                          { value: "commit", label: T.commit },
                          { value: "missingBasis", label: T.missingBasis },
                          { value: "delayed", label: T.delayed },
                        ]
                  }
                  ariaLabel={T.status}
                />
              ) : null}
              {screen === "forecast" || screen === "history" ? (
                <NativeSelect
                  aria-label={T.scope}
                  wrapperClassName={styles.compactSelect}
                  className="h-control-md min-h-control-md text-body-small"
                  value={scope.startsWith("owner:") ? "personal" : scope}
                  onChange={(event) => push({ scope: event.target.value })}
                  disabled={pending}
                >
                  {data.workspace ? (
                    <option value="workspace">{T.companyScope}</option>
                  ) : null}
                  <option value="personal">{T.selfScope}</option>
                  {data.regions.map((r) => (
                    <option key={r.id} value={`territory:${r.id}`}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
              {screen === "history" && reports.length ? (
                <NativeSelect
                  aria-label={T.snapshotSelect}
                  wrapperClassName={`${styles.snapshotSelect} max-w-overlay-lg`}
                  value={snapshot ?? reports.at(-1)?.key}
                  className="h-control-md min-h-control-md text-body-small"
                  onChange={(event) => push({ snapshot: event.target.value })}
                >
                  {[...reports].reverse().map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
              <div className={styles.periodGroup}>
                <NativeSelect
                  aria-label={T.period}
                  value={year}
                  disabled={pending}
                  onChange={(event) =>
                    push({
                      period:
                        periodPart === "year"
                          ? `Y${event.target.value}`
                          : `${event.target.value}${periodPart}`,
                      planRevision: "",
                    })
                  }
                >
                  {years.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </NativeSelect>
                <SegmentedControl
                  size="md"
                  value={periodPart}
                  onChange={(value) =>
                    push({
                      period: value === "year" ? `Y${year}` : `${year}${value}`,
                    })
                  }
                  items={[
                    { value: "year", label: T.fullYear },
                    ...[1, 2, 3, 4].map((q) => ({
                      value: `Q${q}`,
                      label: `Q${q}`,
                    })),
                  ]}
                  ariaLabel={T.period}
                />
              </div>
              {screen !== "forecast" && screen !== "history" ? (
                <Discuss
                  context={`${title}; ${data.period}; ${T.observed} ${data.observedAt}; ${summary}; ${T.actual} ${row.closed.value ?? T.unknown} ${row.currency}; ${T.remaining} ${row.gap ?? T.unknown}`}
                />
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-md" variant="ghost" aria-label={T.more}>
                    <Icon name="more-vertical" size="md" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDrawer("source")}>
                    {T.source}
                  </DropdownMenuItem>
                  {data.versions.length > 0 && !scope.startsWith("owner:") ? (
                    <DropdownMenuItem onSelect={() => setDrawer("versions")}>
                      {T.versions}
                    </DropdownMenuItem>
                  ) : null}
                  {data.canPlan ? (
                    <DropdownMenuItem asChild>
                      <Link
                        href={planningHref(
                          data.year,
                          scope.startsWith("territory:")
                            ? scope.slice(10)
                            : null,
                          data.revision?.id,
                          data.period,
                        )}
                      >
                        {T.planning}
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
        }}
      />
      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer === "versions" ? T.versions : T.targetSource}
        className="max-w-[100vw]"
        width="md"
      >
        {drawer === "versions" ? (
          <div className="flex flex-col gap-sm">
            <Button
              variant="ghost"
              onClick={() => {
                push({ planRevision: "" });
                setDrawer(null);
              }}
            >
              {T.latest}
            </Button>
            {data.versions.map((v) => (
              <Button
                key={v.id}
                variant="ghost"
                onClick={() => {
                  push({ planRevision: v.id });
                  setDrawer(null);
                }}
              >
                V{v.version} {"\u00b7"} {v.effectiveAt.slice(0, 10)}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-lg text-body-small">
            <p>{T.readOnly}</p>
            <dl className="grid grid-cols-2 gap-md">
              <dt>{T.period}</dt>
              <dd>{data.period}</dd>
              <dt>{T.scope}</dt>
              <dd>{name}</dd>
              <dt>{T.versions}</dt>
              <dd>
                {data.revision ? `V${data.revision.version}` : T.noTarget}
              </dd>
              <dt>{T.observed}</dt>
              <dd>{new Date(data.observedAt).toLocaleString(locale)}</dd>
            </dl>
            {(data.targets ?? [])
              .filter((t) => t.scope === scope && t.period === data.period)
              .map((t) => (
                <div
                  key={t.key}
                  className="border-t border-dashed border-border pt-md"
                >
                  <strong className="font-medium">{T[t.metric]}</strong>
                  <div className="mt-sm flex justify-between gap-sm">
                    {["floor", "target", "stretch"].map((key) => (
                      <span key={key}>
                        {T[key as "target"]} {t[key as "target"] ?? "\u2014"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Drawer>
    </>
  );
}
