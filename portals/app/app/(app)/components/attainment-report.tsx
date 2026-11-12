"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Drawer, MetricListCard } from "@vxture/design-ui";
import type { AttainmentReportPoint } from "../../domains/pipeline/lib/forecast";
import { reportedAttainment, snapshotKey } from "../lib/attainment-progress";
import { attainmentHref, planningHref } from "../lib/attainment-workspace";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";

export function AttainmentReport({
  snapshot,
  error = false,
  period,
  scope,
  currentRevision,
  canHistory,
  canPlan,
  historical = false,
}: {
  snapshot: AttainmentReportPoint | null;
  error?: boolean;
  period: string;
  scope: string;
  currentRevision?: string | null;
  canHistory: boolean;
  canPlan: boolean;
  historical?: boolean;
}) {
  const { ATTAINMENT_PLAN_TEXT: T, DS_LABELS } = useMessages();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  if (error)
    return (
      <p role="alert" className="text-body-small text-danger-text">
        {T.reportUnavailable}
      </p>
    );
  if (!snapshot)
    return (
      <p className="text-body-small text-muted-foreground">{T.noReport}</p>
    );
  const { basis, target, ratio } = reportedAttainment(snapshot);
  const version =
    basis === null
      ? T.confirmHidden
      : !basis
        ? T.legacyReport
        : basis.sourceKind === "none" || target === null
          ? T.noReportTarget
          : basis.sourceKind === "sales_plan"
            ? `V${basis.version}`
            : T.legacy;
  const time = `${snapshot.snapshotAt.toLocaleString(locale, { timeZone: "UTC" })} UTC`;
  const money = (n: number, currency = snapshot.currency) =>
    formatMoney(n, currency, locale);
  const details = (
    <div className="flex flex-col gap-md">
      <p className="text-body-small text-muted-foreground">
        {T.historyScope}
        {" \u00b7 "}
        {time}
      </p>
      <dl className="grid grid-cols-2 gap-md text-body-small">
        {[
          [T.source, version],
          [
            T.reportedTarget,
            target === null
              ? "-"
              : money(target, basis?.currency ?? snapshot.currency),
          ],
          [T.reportedClosed, money(snapshot.closedAmount.amount)],
          [
            T.reportedRate,
            ratio === null ? "-" : `${(ratio * 100).toFixed(1)}%`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-xs">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {canPlan && basis?.sourceKind === "sales_plan" && basis.revisionId ? (
        <Button asChild size="xl" variant="outline">
          <Link
            href={planningHref(
              Number(period.replace(/^Y/, "").slice(0, 4)),
              snapshot.territoryId,
              basis.revisionId,
              period,
            )}
          >
            {T.planning}
          </Link>
        </Button>
      ) : null}
    </div>
  );
  return (
    <>
      {historical ? (
        <MetricListCard title={T.reportDetail} note={details} />
      ) : (
        <div
          className="flex flex-wrap items-center justify-between gap-x-md gap-y-sm text-body-small"
          data-attainment-report
        >
          <span className="text-muted-foreground">
            {T.report} {time}
            {" \u00b7 "}
            {version}
            {" \u00b7 "}
            {T.reportedClosed} {money(snapshot.closedAmount.amount)}
            {" \u00b7 "}
            {T.reportedRate}{" "}
            {ratio === null ? "-" : `${(ratio * 100).toFixed(1)}%`}
            {basis?.revisionId &&
            currentRevision &&
            basis.revisionId !== currentRevision ? (
              <span className="ml-sm text-warning-text">{T.planChanged}</span>
            ) : null}
          </span>
          <Button size="md" variant="ghost" onClick={() => setOpen(true)}>
            {T.viewReport}
          </Button>
        </div>
      )}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="md"
        title={T.reportDetail}
        closeLabel={DS_LABELS.confirmCancel}
      >
        {details}
        {canHistory ? (
          <Button asChild size="xl" variant="outline">
            <Link
              href={attainmentHref({
                period,
                scope,
                view: "history",
                snapshot: snapshotKey(snapshot),
              })}
            >
              {T.reportSnapshot}
            </Link>
          </Button>
        ) : null}
      </Drawer>
    </>
  );
}
