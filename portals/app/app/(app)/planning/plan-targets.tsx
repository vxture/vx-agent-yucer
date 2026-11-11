"use client";
import {
  Button,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type {
  PlanContent,
  PlanTarget,
} from "../../domains/planning/plan-model";
export function PlanTargets({
  content,
  scope,
  edit,
  disabled,
}: {
  content: PlanContent;
  scope: string;
  edit: ((c: PlanContent) => void) | null;
  disabled: boolean;
}) {
  const locale = useLocale();
  const { PLAN_VERSION_TEXT: T, PLANNING_TEXT: P } = useMessages();
  const label = {
    revenue: P.metricRevenue,
    new_logo: P.metricNewLogo,
    pipeline: P.metricPipeline,
    margin: P.metricMargin,
  };
  const rows = content.targets.filter((t) => t.scope === scope);
  const update = (
    key: string,
    tier: "floor" | "target" | "stretch",
    value: string,
  ) =>
    edit?.({
      ...content,
      targets: content.targets.map((t) =>
        t.key === key ? { ...t, [tier]: value.trim() || null } : t,
      ),
    });
  const add = (metric: PlanTarget["metric"], period: string) => {
    const existing = rows.find((t) => t.metric === metric);
    const currency =
      metric === "new_logo"
        ? null
        : (existing?.currency ??
          content.targets.find((t) => t.metric === "revenue")?.currency ??
          "CNY");
    if (
      rows.some(
        (t) =>
          t.period === period && t.metric === metric && t.currency === currency,
      )
    )
      return;
    edit?.({
      ...content,
      targets: [
        ...content.targets,
        {
          key: crypto.randomUUID(),
          scope,
          period,
          metric,
          currency,
          floor: null,
          target: null,
          stretch: null,
          note: "",
        },
      ],
    });
  };
  return (
    <div className="flex flex-col gap-md">
      {edit ? (
        <div className="flex flex-wrap gap-sm">
          {(["revenue", "new_logo", "pipeline", "margin"] as const).map(
            (metric) =>
              !rows.some(
                (t) => t.metric === metric && t.period === `Y${content.year}`,
              ) ? (
                <Button
                  key={metric}
                  size="md"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => add(metric, `Y${content.year}`)}
                >
                  {T.addMetric} · {label[metric]}
                </Button>
              ) : null,
          )}
          <Button
            size="md"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              let c = structuredClone(content);
              for (const base of rows.filter(
                (t) => t.period === `Y${content.year}`,
              ))
                for (let q = 1; q <= 4; q++) {
                  const period = `${content.year}Q${q}`;
                  if (
                    !c.targets.some(
                      (t) =>
                        t.scope === scope &&
                        t.metric === base.metric &&
                        t.period === period &&
                        t.currency === base.currency,
                    )
                  )
                    c.targets.push({
                      ...base,
                      key: crypto.randomUUID(),
                      period,
                      floor: null,
                      target: null,
                      stretch: null,
                    });
                }
              edit(c);
            }}
          >
            {T.addQuarter}
          </Button>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            {[
              T.period,
              T.metric,
              T.floor,
              T.target,
              T.stretch,
              ...(edit ? [T.remove] : []),
            ].map((s) => (
              <TableHead key={s}>{s}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.key}>
              <TableCell className="whitespace-nowrap">{t.period}</TableCell>
              <TableCell className="whitespace-nowrap">
                {label[t.metric]}
                <span className="ml-sm text-label-small text-muted-foreground">
                  {t.currency ?? T.count}
                </span>
              </TableCell>
              {(["floor", "target", "stretch"] as const).map((tier) => (
                <TableCell
                  key={tier}
                  className="min-w-24 text-right tabular-nums"
                >
                  {edit ? (
                    <Input
                      aria-label={`${t.period} ${label[t.metric]} ${T[tier]}`}
                      inputMode="decimal"
                      value={t[tier] ?? ""}
                      placeholder="—"
                      disabled={disabled}
                      onChange={(e) => update(t.key, tier, e.target.value)}
                    />
                  ) : t[tier] === null ? (
                    "—"
                  ) : (
                    Number(t[tier]).toLocaleString(locale, {
                      maximumFractionDigits: 2,
                    })
                  )}
                </TableCell>
              ))}
              {edit ? (
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={
                      disabled ||
                      (t.period === `Y${content.year}` &&
                        t.metric === "revenue")
                    }
                    onClick={() =>
                      edit({
                        ...content,
                        targets: content.targets.filter((x) => x.key !== t.key),
                        contributions: content.contributions.filter(
                          (x) => x.targetKey !== t.key,
                        ),
                      })
                    }
                  >
                    {T.remove}
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
