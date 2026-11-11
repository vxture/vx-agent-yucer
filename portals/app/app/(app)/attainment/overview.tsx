import Link from "next/link";
import { Button, EmptyState, Progress, Section } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { resolveLocale } from "../lib/i18n/locale";
import { formatMoney } from "../lib/view-model";
import { loadFailureText } from "../lib/load-failure";
import {
  revenuePeriods,
  revenueTarget,
  type resolveAttainmentQuery,
} from "../lib/attainment-workspace";
import { periodRange } from "../../domains/shared/period";
import {
  AttainmentPeriodTable,
  type AttainmentPeriodRow,
} from "../components/attainment-tables";
import { loadAttainmentBase, loadPublishedAttainment } from "./board";

type Selection = ReturnType<typeof resolveAttainmentQuery>;
export async function AttainmentOverview({
  selection,
}: {
  readonly selection: Selection;
}) {
  const data = await loadAttainmentBase();
  if (!data) return null;
  const {
    ATTAINMENT_TEXT: { workspace: T },
    SHELL_TEXT,
    LOAD_ERROR,
  } = await getMessages();
  const locale = await resolveLocale();
  if (!data.targets.ok)
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(data.targets.violations, LOAD_ERROR)}
      />
    );
  const { period, scope, view } = selection;
  if (period === "all") {
    const periods = revenuePeriods(data.targets.value, scope);
    const rows = await Promise.all(
      periods.map(async (period): Promise<AttainmentPeriodRow> => {
        const target = revenueTarget(
          data.targets.ok ? data.targets.value : [],
          period,
          scope,
        )!;
        const result = periodRange(period)
          ? await loadPublishedAttainment(period)
          : null;
        const measured = result?.ok
          ? result.value.find((r) => r.target.id === target.id)?.measurement
          : null;
        return {
          period,
          target: target.targetValue.amount,
          currency:
            target.targetValue.unit === "money"
              ? target.targetValue.currency
              : "",
          achieved:
            measured?.kind === "measured" ? measured.achieved.amount : null,
          ratio: measured?.kind === "measured" ? measured.ratio : null,
          error: !periodRange(period)
            ? T.periodUnsupported
            : result && !result.ok
              ? loadFailureText(result.violations, LOAD_ERROR)
              : null,
        };
      }),
    );
    return (
      <Section icon="calendar" title={T.allTitle} description={T.allHint}>
        <AttainmentPeriodTable
          rows={rows}
          scope={selection.selection}
          view={view}
        />
      </Section>
    );
  }
  const target = revenueTarget(data.targets.value, period, scope);
  if (!target || target.targetValue.unit !== "money")
    return (
      <Section icon="flag" title={T.publishedTitle}>
        <div className="flex flex-wrap items-center justify-between gap-md">
          <div className="flex flex-col gap-xs">
            <p className="text-label font-medium">{T.noTarget}</p>
            <p className="text-body-small text-muted-foreground">
              {T.noTargetHint}
            </p>
          </div>
          <Button asChild size="md" variant="outline">
            <Link href="/planning">{T.planning}</Link>
          </Button>
        </div>
      </Section>
    );
  const result = await loadPublishedAttainment(period);
  const measurement = result?.ok
    ? result.value.find((r) => r.target.id === target.id)?.measurement
    : null;
  const measured = measurement?.kind === "measured" ? measurement : null;
  const money = (n: number) =>
    formatMoney(
      n,
      target.targetValue.unit === "money" ? target.targetValue.currency : "",
      locale,
    );
  const metrics = [
    { label: T.target, value: money(target.targetValue.amount) },
    {
      label: T.publishedClosed,
      value: measured ? money(measured.achieved.amount) : "-",
    },
    {
      label: T.targetRate,
      value:
        measured?.ratio != null ? `${(measured.ratio * 100).toFixed(1)}%` : "-",
    },
    {
      label: T.publishedGap,
      value: measured
        ? money(
            Math.max(0, target.targetValue.amount - measured.achieved.amount),
          )
        : "-",
    },
  ];
  return (
    <Section icon="flag" title={T.publishedTitle} description={T.publishedHint}>
      <div className="grid grid-cols-2 gap-x-xl gap-y-md lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex min-w-0 flex-col gap-2xs">
            <span className="text-body-small text-muted-foreground">
              {m.label}
            </span>
            <span className="text-label font-semibold tabular-nums">
              {m.value}
            </span>
          </div>
        ))}
      </div>
      {measured?.ratio != null ? (
        <Progress value={Math.max(0, Math.min(100, measured.ratio * 100))} />
      ) : result && !result.ok ? (
        <p className="text-body-small text-muted-foreground">
          {loadFailureText(result.violations, LOAD_ERROR)}
        </p>
      ) : (
        <p className="text-body-small text-muted-foreground">
          {measured ? T.noRatio : T.noPublished}
        </p>
      )}
    </Section>
  );
}
