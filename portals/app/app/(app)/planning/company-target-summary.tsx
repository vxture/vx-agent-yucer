"use client";
import { Icon, Input, MetricListCard } from "@vxture/design-ui";
import { planningTierPercent } from "../lib/planning-preview";
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
              <span className="flex items-center gap-md">
                <Icon
                  name={
                    tier === "floor"
                      ? "shield-check"
                      : tier === "target"
                        ? "flag"
                        : "trend-up"
                  }
                  size="xl"
                  className="shrink-0 text-muted-foreground"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-sm">
                  <span className="flex items-baseline justify-between gap-sm">
                    <span className="whitespace-nowrap">
                      {T[tier]}
                      {tier !== "target" ? (
                        <span className="ml-xs text-body-small font-normal text-muted-foreground">
                          {planningTierPercent(
                            target?.[tier],
                            target?.target,
                            locale,
                          )}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-body-small font-normal text-muted-foreground">
                      {target?.currency ?? currency}
                    </span>
                  </span>
                  {edit && target ? (
                    <Input
                      aria-label={`${target.period} ${P.metricRevenue} ${T[tier]}`}
                      inputMode="decimal"
                      value={target[tier] ?? ""}
                      placeholder={"\u2014"}
                      disabled={disabled}
                      onChange={(event) =>
                        edit({
                          ...content,
                          targets: content.targets.map((t) =>
                            t.key === target.key
                              ? {
                                  ...t,
                                  [tier]: event.target.value.trim() || null,
                                }
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
                  )}
                </span>
              </span>
            }
          />
        ))}
        <MetricListCard
          title={
            <span className="flex items-center gap-md">
              <Icon
                name="users"
                size="xl"
                className="shrink-0 text-muted-foreground"
              />
              <span className="flex min-w-0 flex-col gap-sm">
                <span>{T.personnel}</span>
                <span className="flex items-baseline gap-xs whitespace-nowrap">
                  <span className="text-heading-2 tabular-nums text-foreground">
                    {members}
                  </span>
                  <span className="text-body-small font-normal text-muted-foreground">
                    {T.personUnit}
                    {" \u00b7 "}
                    {T.staffingGap} {format(requested)} FTE
                  </span>
                </span>
              </span>
            </span>
          }
        />
      </div>
    </div>
  );
}

// Allocation describes planning progress, so it belongs in the card header.
export function CompanyTargetAllocation({
  content,
  target,
  currency,
}: {
  content: PlanContent;
  target: PlanTarget | undefined;
  currency: string;
}) {
  const locale = useLocale();
  const { PLAN_VERSION_TEXT: T } = useMessages();
  const format = (value: string | number | null | undefined) =>
    value == null
      ? "\u2014"
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

  return (
    <span
      className="flex items-center gap-md whitespace-nowrap text-body-small font-normal text-muted-foreground"
      data-company-target-allocation
    >
      <span>
        {T.allocated} {format(allocated)}
      </span>
      <span>
        {T.allocation}{" "}
        {format(
          target?.target == null ? null : Number(target.target) - allocated,
        )}
      </span>
      <span>{target?.currency ?? currency}</span>
    </span>
  );
}
