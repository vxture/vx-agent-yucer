"use client";

import Link from "next/link";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { commitmentRevenue, commitmentSupport } from "../../domains/planning/commitment-summary";
import type { PlanContent } from "../../domains/planning/plan-model";
import { focusHref } from "../lib/focus-workspace";
import { attainmentCoverageHref } from "../lib/attainment-workspace";
import links from "../components/business-reference.module.css";

export function CommitmentRevenue({ content, regionId, draft = false }: { readonly content: PlanContent; readonly regionId?: string | null; readonly draft?: boolean }) {
  const { PLANNING_COMMITMENT_TEXT: T } = useMessages(), locale = useLocale();
  const rows = commitmentRevenue(content, regionId);
  const format = (value: string | null) => value === null ? T.missing : Number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  return <div className="flex min-w-0 flex-col gap-sm" data-commitment-reconciliation>
    {rows.map(row => <dl key={row.currency} className="flex min-w-0 flex-wrap items-center gap-x-xl gap-y-sm text-body-small">
      {[{label: draft ? T.draftAnnual : T.annual, value: row.annual}, {label:T.strategic, value:row.accepted}, {label:row.excess ? T.excess : T.other, value:row.excess ?? row.remaining}].map((item, i) => <div key={item.label} className="inline-flex flex-wrap items-baseline gap-xs">
        <dt className="text-muted-foreground">{item.label}</dt><dd className={i === 2 && row.excess ? "text-destructive" : "text-foreground"}>{format(item.value)} <span className="text-muted-foreground">{row.currency}</span></dd>
      </div>)}
      <Tooltip><TooltipTrigger className="text-muted-foreground" aria-label={T.reconcileHelp}>{row.pending ? T.pendingAllocation : T.axisHelp}</TooltipTrigger><TooltipContent className="max-w-sm">{T.reconcileHelp}{row.invalid ? ` ${T.annualInput}` : ""}</TooltipContent></Tooltip>
    </dl>)}
  </div>;
}

export function CommitmentSupport({ content, regionId, revisionId, draft, canAttainment, canCustomers, onShowHandoff }: { readonly content: PlanContent; readonly regionId?: string | null; readonly revisionId?: string; readonly draft: boolean; readonly canAttainment: boolean; readonly canCustomers: boolean; readonly onShowHandoff: () => void }) {
  const { PLANNING_COMMITMENT_TEXT: T } = useMessages(), locale = useLocale();
  const summary = commitmentSupport(content, regionId);
  const period = `Y${content.year}`;
  const customerLink = focusHref({year:content.year, revisionId, regionId, period});
  const evidenceLink = canAttainment && !draft && revisionId ? attainmentCoverageHref({period, scope:regionId ? `territory:${regionId}` : "workspace", planRevision:revisionId, evidence:"open"}) : null;
  const value = (n: string | null) => n === null ? T.missing : Number(n).toLocaleString(locale, { maximumFractionDigits: 2 });
  const newCustomerUnit = summary.newCustomers === null ? "" : ` ${T.customerUnit}`;
  const pipelineCurrency = summary.pipeline?.currency ? ` ${summary.pipeline.currency}` : "";
  const items = [
    {label:T.customers, value:`${summary.customers} ${T.customerUnit}`, href:revisionId && canCustomers ? customerLink : null},
    {label:T.newCustomers, value:`${value(summary.newCustomers)}${newCustomerUnit}`, href:null},
    {label:T.pipeline, value:`${value(summary.pipeline?.target ?? null)}${pipelineCurrency}`, href:summary.pipeline?.target != null ? evidenceLink : null},
    {label:T.special, value:`${summary.specialTargets} ${T.targetUnit}`, href:null, onClick:summary.specialTargets ? onShowHandoff : undefined},
    {label:T.actions, value:`${summary.datedActions.toLocaleString(locale)}/${summary.actions.toLocaleString(locale)}`, href:null},
  ];
  return <div className="flex min-w-0 flex-wrap items-center gap-x-lg gap-y-sm border-t border-dashed border-border pt-md text-body-small" data-commitment-support>
    <Tooltip><TooltipTrigger className="text-muted-foreground" aria-label={T.supportHelp}>{T.support}</TooltipTrigger><TooltipContent className="max-w-sm">{T.supportHelp}{" "}{T.countHelp}</TooltipContent></Tooltip>
    {items.map(item => {
      let detail = <span>{item.value}</span>;
      if (item.href) detail = <Link className={links.textLink} href={item.href}>{item.value}</Link>;
      if (item.onClick) detail = <Button size="sm" variant="ghost" className={`${links.textLink} text-body-small`} onClick={item.onClick}>{item.value}</Button>;
      return <span key={item.label} className="inline-flex items-baseline gap-xs"><span className="text-muted-foreground">{item.label}</span>{detail}</span>;
    })}
  </div>;
}
