"use client";
import { planningTierPercent } from "../lib/planning-preview";
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
  showTarget = false,
}: {
  content: PlanContent;
  target: PlanTarget | undefined;
  currency: string;
  showTarget?: boolean;
}) {
  const locale = useLocale();
  const { PLAN_VERSION_TEXT: T, PLAN_WORKSPACE_TEXT: W, REGIONAL_PLANNING_TEXT: R, COMPANY_PLANNING_TEXT: C } = useMessages();
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
      {showTarget ? <span className="inline-flex items-baseline gap-xs"><span className="text-muted-foreground">{R.companyTarget}</span><strong className="text-heading-3 font-semibold tabular-nums text-foreground">{format(target?.target ?? null)}</strong></span> : null}
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
        {target?.metric === "new_logo" ? C.customerUnit : target?.currency ?? currency}
      </span>
      {unknown ? (
        <span className="text-body-small text-muted-foreground">
          {W.unknownTargets} {unknown}
        </span>
      ) : null}
    </span>
  );
}

export function RegionTargetAllocation({ content, target }: { content: PlanContent; target: PlanTarget | undefined }) {
  const { REGIONAL_PLANNING_TEXT: R, PLAN_VERSION_TEXT: T, COMPANY_PLANNING_TEXT: C } = useMessages();
  const locale = useLocale();
  const company = content.targets.find(t => t.scope === "workspace" && t.period === target?.period && t.metric === target?.metric && t.currency === target?.currency);
  const allocation = companyAllocation(content, company);
  const format = (value: string | null | undefined) => value == null ? "\u2014" : Number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  const unit = target?.metric === "new_logo" ? C.customerUnit : target?.currency;
  return <span className="flex flex-wrap items-baseline gap-x-md gap-y-xs text-body" data-region-target-context>
    <span className="inline-flex items-baseline gap-xs"><span className="text-muted-foreground">{R.companyTarget}</span><strong className="font-medium tabular-nums">{format(company?.target)}</strong><span data-number-role="unit">{unit}</span></span>
    <span className="inline-flex items-baseline gap-xs"><span className="text-muted-foreground">{R.share}</span><strong className="font-medium tabular-nums">{planningTierPercent(target?.target, company?.target, locale) ?? "\u2014"}</strong></span>
    <span className="inline-flex items-baseline gap-xs"><span className="text-muted-foreground">{T.allocation}</span><strong className={`font-medium tabular-nums ${Number(allocation.balance) < 0 ? "text-destructive" : ""}`}>{format(allocation.balance)}</strong><span data-number-role="unit">{unit}</span></span>
  </span>;
}
