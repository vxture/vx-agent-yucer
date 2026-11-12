"use client";
import Link from "next/link";
import { Button, MetricListCard } from "@vxture/design-ui";
import type { ForecastSnapshotPoint } from "../../domains/pipeline/lib/forecast";
import { snapshotAttainment } from "../lib/attainment-progress";
import { planningHref } from "../lib/attainment-workspace";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";

export function ForecastSnapshotBasis({
  snapshot,
  period,
  canPlan,
}: {
  snapshot: ForecastSnapshotPoint | null;
  period: string;
  canPlan: boolean;
}) {
  const { ATTAINMENT_PLAN_TEXT: T } = useMessages();
  const locale = useLocale();
  if (!snapshot)
    return (
      <p className="text-body-small text-muted-foreground">{T.noSnapshot}</p>
    );
  const { basis, target, ratio } = snapshotAttainment(snapshot);
  const version =
    basis === null
      ? T.confirmHidden
      : !basis
        ? T.legacySnapshot
        : basis.sourceKind === "none" || target === null
          ? T.noSnapshotTarget
          : basis.sourceKind === "sales_plan"
            ? `V${basis.version}`
            : T.legacy;
  const time = `${snapshot.snapshotAt.toLocaleString(locale, { timeZone: "UTC" })} UTC`;
  const money = (n: number, currency = snapshot.currency) =>
    formatMoney(n, currency, locale);
  const details = (
    <div className="flex flex-col gap-md">
      <p className="text-body-small text-muted-foreground">
        {T.snapshotScope}
        {" \u00b7 "}
        {time}
      </p>
      <dl className="grid grid-cols-2 gap-md text-body-small">
        {[
          [T.source, version],
          [
            T.snapshotTarget,
            target === null
              ? "-"
              : money(target, basis?.currency ?? snapshot.currency),
          ],
          [T.snapshotClosed, money(snapshot.closedAmount.amount)],
          [
            T.snapshotRate,
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
  return <MetricListCard title={T.snapshotDetail} note={details} />;
}
