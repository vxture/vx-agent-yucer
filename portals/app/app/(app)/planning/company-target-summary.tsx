"use client";
import { Input, MetricListCard } from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type {
  PlanContent,
  PlanTarget,
} from "../../domains/planning/plan-model";

export function CompanyTargetSummary({
  content,
  target,
  currency,
  edit,
  disabled,
}: {
  content: PlanContent;
  target: PlanTarget | undefined;
  currency: string;
  edit: ((content: PlanContent) => void) | null;
  disabled: boolean;
}) {
  const locale = useLocale();
  const { PLAN_VERSION_TEXT: T, PLANNING_TEXT: P } = useMessages();
  const format = (value: string | number | null | undefined) =>
    value == null
      ? "—"
      : Number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  const allocated = content.targets
    .filter(
      (t) =>
        t.scope !== "workspace" &&
        t.period === `Y${content.year}` &&
        t.metric === "revenue" &&
        t.currency === target?.currency &&
        t.target != null,
    )
    .reduce((total, t) => total + Number(t.target), 0);
  const members = new Set(
    content.team.filter((t) => t.memberSub).map((t) => t.memberSub),
  ).size;
  const requested = content.team
    .filter((t) => !t.memberSub)
    .reduce((total, t) => total + Number(t.requestedFte), 0);
  return (
    <div className="flex flex-col gap-md py-sm">
      <div
        className="grid grid-cols-2 gap-md @3xl:grid-cols-4"
        data-company-target-summary
      >
        {(["floor", "target", "stretch"] as const).map((tier) => (
          <MetricListCard
            key={tier}
            title={
              <span className="flex items-center justify-between gap-sm">
                <span>{T[tier]}</span>
                <span className="text-body-small font-normal text-muted-foreground">
                  {target?.currency ?? currency}
                </span>
              </span>
            }
            note={
              edit && target ? (
                <Input
                  aria-label={`${target.period} ${P.metricRevenue} ${T[tier]}`}
                  inputMode="decimal"
                  value={target[tier] ?? ""}
                  placeholder="—"
                  disabled={disabled}
                  onChange={(event) =>
                    edit({
                      ...content,
                      targets: content.targets.map((t) =>
                        t.key === target.key
                          ? { ...t, [tier]: event.target.value.trim() || null }
                          : t,
                      ),
                    })
                  }
                />
              ) : (
                <span
                  className={`text-heading-2 tabular-nums ${tier === "target" ? "text-primary" : "text-foreground"}`}
                >
                  {format(target?.[tier])}
                </span>
              )
            }
          />
        ))}
        <MetricListCard
          title={T.resources}
          note={
            <div className="flex flex-col gap-sm">
              <span className="flex items-baseline gap-sm">
                <span className="text-heading-2 tabular-nums text-foreground">
                  {members}
                </span>
                <span>{T.people}</span>
              </span>
              <span>
                {T.needs} · {format(requested)} FTE
              </span>
            </div>
          }
        />
      </div>
      <p className="flex flex-wrap gap-x-lg gap-y-xs text-body-small text-muted-foreground">
        <span>
          {T.allocated} {format(allocated)} {target?.currency ?? currency}
        </span>
        <span>
          {T.allocation}{" "}
          {format(
            target?.target == null ? null : Number(target.target) - allocated,
          )}{" "}
          {target?.currency ?? currency}
        </span>
      </p>
    </div>
  );
}
