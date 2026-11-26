"use client";
import Link from "next/link";
import { DeploymentCard, DeploymentField } from "./deployment-card";
import { PageActionButton } from "./page-header-actions";
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
  return <DeploymentCard title={T.snapshotDetail} icon="archive" meta={<><span>{T.snapshotScope}</span><time dateTime={snapshot.snapshotAt.toISOString()}>{time}</time></>}
    actions={canPlan && basis?.sourceKind === "sales_plan" && basis.revisionId ? <PageActionButton asChild><Link href={planningHref(Number(period.replace(/^Y/, "").slice(0, 4)), snapshot.territoryId, basis.revisionId, period)}>{T.planning}</Link></PageActionButton> : undefined}>
    <dl className="grid grid-cols-1 gap-md @3xl:grid-cols-2 text-body">
      <DeploymentField label={T.source}>{version}</DeploymentField>
      <DeploymentField label={T.snapshotTarget}><span className="font-medium tabular-nums text-primary-text">{target === null ? "-" : money(target, basis?.currency ?? snapshot.currency)}</span></DeploymentField>
      <DeploymentField label={T.snapshotClosed}><span className="tabular-nums">{money(snapshot.closedAmount.amount)}</span></DeploymentField>
      <DeploymentField label={T.snapshotRate}><span className="tabular-nums">{ratio === null ? "-" : `${(ratio * 100).toFixed(1)}%`}</span></DeploymentField>
    </dl>
  </DeploymentCard>;
}
