"use client";
import { companyAllocation } from "../lib/planning-workspace";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type {
  PlanContent,
  PlanTarget,
} from "../../domains/planning/plan-model";

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
  const { PLAN_VERSION_TEXT: T, PLAN_WORKSPACE_TEXT: W } = useMessages();
  const { allocated, balance, unknown } = companyAllocation(content, target);
  const format = (value: string | null) =>
    value == null
      ? "\u2014"
      : Number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  return (
    <span
      className="flex flex-wrap items-center gap-x-md gap-y-xs text-body"
      data-company-target-allocation
    >
      <span className="inline-flex items-baseline gap-xs">
        <span className="text-muted-foreground">{T.allocated}</span>
        <strong className="text-heading-3 font-semibold tabular-nums text-foreground">
          {format(allocated)}
        </strong>
      </span>
      <span className="inline-flex items-baseline gap-xs">
        <span className="text-muted-foreground">{T.allocation}</span>
        <strong
          className={`text-heading-3 font-semibold tabular-nums ${balance != null && Number(balance) < 0 ? "text-destructive" : "text-foreground"}`}
        >
          {format(balance)}
        </strong>
      </span>
      <span className="text-body-small text-muted-foreground">
        {target?.currency ?? currency}
      </span>
      {unknown ? (
        <span className="text-body-small text-muted-foreground">
          {W.unknownTargets} {unknown}
        </span>
      ) : null}
    </span>
  );
}
