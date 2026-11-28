"use client";
import { ActionResultEditor } from "../attainment/action-result-editor";
import { attainmentCopy } from "../attainment/copy";
import type { PlanActionResult } from "../../domains/planning/action-result";
import { useState, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@vxture/design-ui";
import { DeploymentField } from "../components/deployment-card";
import links from "../components/business-reference.module.css";
import { ViewHeader } from "../components/business-controls";
import type { FocusRow, FocusWorkspace, FocusDetail } from "../../domains/planning/focus-model";
import { PageActionButton } from "../components/page-header-actions";
import { Section as HelpSection } from "../components/help-section";
import { RowActions } from "../components/table-fittings";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { focusHref } from "../lib/focus-workspace";
import { planningHref } from "../lib/planning-workspace";
import { RevenueValue, KeyCoverage, DecisionChains, CoverageAttention } from "./coverage";
import { ContactPreview } from "../components/contact-preview";
import { FocusEditor } from "./editor";
import { Tag } from "../components/tag";
export function FocusDetailView({ workspace: w, row, regionTeams, opportunities, pipelineState, canOpenPlanning,
  actionResults = [],
  canVerifyAction = false,
}: Readonly<{
  actionResults?: PlanActionResult[] | null;
  canVerifyAction?: boolean;
  workspace: FocusWorkspace; row: FocusRow; regionTeams: FocusDetail["regionTeams"];
  opportunities: { id: string; name: string; status: string; amount: number | null; currency: string; date: string }[];
  pipelineState: "ready" | "failed" | "denied"; canOpenPlanning: boolean;
}>) {
  const { FOCUS_TEXT: T, PLAN_VERSION_TEXT: P, POSITION_TEXT: C, ACCOUNT_TEXT: A, DS_LABELS } = useMessages(), locale = useLocale(), router = useRouter();
  const AT = attainmentCopy(locale);
  const [editor, setEditor] = useState<{ mode: "action" | "contribution" | "remove"; actionKey?: string; contributionKey?: string } | null>(null);
  const money = (value: string | number | null, unit: string | null) => (
    <span className="whitespace-nowrap tabular-nums">{value == null ? T.unknown : Number(value).toLocaleString(locale)}{value != null && unit ? (
        <span className="ml-xs text-body-small text-muted-foreground">{unit}</span>
      ) : null}</span>
  );
  const edit = w.canEdit && w.revision?.draft;
  return (
    <>
    <ViewHeader title={row.name} icon="star" divider secondary={<Tag>{tierLabel(row.tier, C)}</Tag>}
      description={<span className="flex flex-wrap items-center gap-x-md gap-y-xs text-body-small text-muted-foreground"><span>{row.accountNo}</span><span>{w.period}</span><span>{w.revision?.draft ? T.draft : `V${w.revision?.version}`}</span></span>}
      pageActions={{ secondary: (
            <PageActionButton asChild><Link href={focusHref({ ...w, revisionId: w.revision?.id })}>{T.back}</Link></PageActionButton>
          ),
        primary: edit && canOpenPlanning ? (
              <PageActionButton intent="primary" asChild><Link href={planningHref({ year: w.year, revision: w.revision?.id, region: w.regionId ?? (row.regions.length === 1 ? row.regions[0].id : null) })}>{T.inspect}</Link></PageActionButton>
            ) : undefined,
        more: (
            <RowActions label={DS_LABELS.actionMenu} items={[
          { id: "account", label: T.openAccount, icon: "building", onSelect: () => router.push(`/account/${encodeURIComponent(row.id)}`) },
          ...(canOpenPlanning && !edit ? [{ id: "planning", label: T.planning, icon: "target" as const, onSelect: () => router.push(planningHref({ year: w.year, revision: w.revision?.id, region: w.regionId })) }] : []),
          ...(edit ? [{ id: "remove", label: T.remove, icon: "trash" as const, onSelect: () => setEditor({ mode: "remove" }) }] : []),
        ]}/>
          ),
        }}/>
    <Section title={T.detail} icon="star" help={`${T.help} ${T.coverageHelp}`}>
      <dl className="grid grid-cols-1 gap-md @3xl:grid-cols-2 text-body">
        <DeploymentField label={T.accountOwner}><MemberName sub={row.ownerSub}/></DeploymentField>
        <DeploymentField label={T.region}>{row.regions.map(r => r.name).join(" / ") || T.regionPending}</DeploymentField>
        <DeploymentField label={T.revenue}><span className="font-medium text-primary-text"><RevenueValue row={row}/></span></DeploymentField>
        <DeploymentField label={T.actions}>{row.actions.length}{" "} <span className="text-muted-foreground">{T.itemUnit}</span></DeploymentField>
        <DeploymentField label={T.keyCoverage}><KeyCoverage coverage={row.coverage}/></DeploymentField>
        <DeploymentField label={T.decisionChains}><DecisionChains coverage={row.coverage}/></DeploymentField>
        <DeploymentField label={A.contactsTitle}><ContactPreview accountId={row.id} summary={row.contacts}/></DeploymentField>
      </dl><div className="mt-md"><CoverageAttention row={row}/></div>
    </Section>
    <Section title={T.contributions} icon="chart-line" help={T.contributionHelp} action={edit ? (
            <PageActionButton onClick={() => setEditor({ mode: "contribution" })}>{T.addContribution}</PageActionButton>
          ) : undefined}>
      {row.contributions.length ? (
          <Table><TableHeader><TableRow>{[T.region, T.target, T.budget, T.contribution, T.responsibility, T.basis, P.operations].map((l) => (
                  <TableHead key={l} className={l === T.budget || l === T.contribution ? "text-right" : undefined}>{l}</TableHead>))}</TableRow></TableHeader><TableBody>{row.contributions.map((c) => (
                <TableRow key={c.key}><TableCell>{row.regions.find(r => r.id === c.regionId)?.name}</TableCell><TableCell>{c.target.period} / {T[`${c.target.metric}Metric`]}</TableCell><TableCell className="text-right">{c.budget.amount === null ? (
                      <span className="text-muted-foreground">{T.budgetUnknown}</span>
                    ) : (
                      money(c.budget.amount, c.budget.currency ?? T.count)
                    )}</TableCell><TableCell className="text-right">{money(c.amount, c.budget.currency ?? T.count)}</TableCell><TableCell>{c.responsibility === "primary" ? T.primary : T.support}</TableCell><TableCell className="max-w-panel-xs"><span className="line-clamp-2" title={c.budget.note}>{c.budget.note || "-"}</span></TableCell><TableCell>{edit ? (
                      <RowActions label={DS_LABELS.actionMenu} items={[{ id: "edit", label: T.editContribution, icon: "edit", onSelect: () => setEditor({ mode: "contribution", contributionKey: c.key }) }]}/>
                    ) : null}</TableCell></TableRow>))}</TableBody></Table>
        ) : (
          <p className="text-body text-muted-foreground">{T.noContribution}</p>
        )}
      {row.unallocated.map((b) => (
          <div key={b.key} className="flex flex-wrap gap-sm text-body"><Tag>{T.regionPending}</Tag><span>{b.period} / {T[`${b.metric}Metric`]}</span>{money(b.amount, b.currency ?? T.count)}<span className="line-clamp-2 text-muted-foreground">{b.note}</span></div>))}
    </Section>
    <Section title={T.actions} icon="list-checks" help={T.actionHelp} action={edit ? (
            <PageActionButton onClick={() => setEditor({ mode: "action" })}>{T.addAction}</PageActionButton>
          ) : undefined}>
      {row.actions.length ? (
          <div className="flex flex-col gap-md">{row.actions.map((a) => (
              <div key={a.key} className="flex min-w-0 items-start justify-between gap-md border-b border-border pb-md last:border-0 last:pb-0 text-body"><div className="flex min-w-0 flex-col gap-sm"><p className="break-words">{a.objective}</p><div className="flex flex-wrap items-center gap-md text-muted-foreground"><span>{row.regions.find(r => r.id === a.regionId)?.name}</span><MemberName sub={a.ownerSub}/><span>{a.due}</span></div></div>
                <div className="flex items-center gap-sm">
                  <span className="text-body-small text-muted-foreground">
                    {actionResults?.find((r) => r.actionKey === a.key)
                      ? actionResults.find((r) => r.actionKey === a.key)!.met
                        ? AT.achieved
                        : AT.unachieved
                      : AT.unverified}
                  </span>
                  {canVerifyAction && !w.closed &&
                  w.revision?.current &&
                  !w.revision.draft ? (
                    <ActionResultEditor
                      year={w.year}
                      period={w.period}
                      revisionId={w.revision.id}
                      accountId={row.id}
                      action={a}
                      result={
                        actionResults?.find((r) => r.actionKey === a.key) ??
                        null
                      }
                    />
                  ) : null}
                  {edit ? (
                    <RowActions label={DS_LABELS.actionMenu} items={[{ id: "edit", icon: "edit", label: T.editAction, onSelect: () => setEditor({ mode: "action", actionKey: a.key }) }]}/>
                  ) : null}</div>
              </div>
            ))}</div>
        ) : (
          <p className="text-body text-muted-foreground">{T.noAction}</p>
        )}
    </Section>
    <Section title={T.teams} icon="users" help={T.teamsHelp}>{regionTeams.some(r => r.allocations.length) ? (
          regionTeams.filter(r => r.allocations.length).map((r) => (
              <div key={r.regionId} className="flex flex-col gap-md"><h3 className="text-body font-medium">{r.regionName}</h3>{r.allocations.map((a) => (
                  <div key={a.key} className="flex flex-wrap items-center gap-md text-body"><MemberName sub={a.memberSub} name={a.memberName} fallback={P.demand}/><span>{a.role}</span><span className="text-muted-foreground">{a.start} - {a.end}</span><span>{a.memberSub ? `${a.percent}%` : `${a.requestedFte} FTE`}</span></div>))}</div>))
        ) : (
          <p className="text-body text-muted-foreground">{T.noTeam}</p>
        )}</Section>
    <Section title={T.opportunities} icon="flag"><RelatedOpportunities opportunities={opportunities} state={pipelineState}/></Section>
    {editor ? (
        <FocusEditor {...editor} row={row} workspace={w} onClose={() => setEditor(null)}/>
      ) : null}
  </>
  );
}

function Section({ children, ...props }: ComponentProps<typeof HelpSection>) {
  return (
    <HelpSection {...props}><Card className="min-w-0 @container"><CardContent>{children}</CardContent></Card></HelpSection>
  );
}

function tierLabel(tier: string, text: ReturnType<typeof useMessages>["POSITION_TEXT"]) {
  if (tier === "strategic") return text.tierStrategic;
  return tier === "key" ? text.tierKey : text.tierStandard;
}
function RelatedOpportunities({ opportunities, state }: Readonly<{ opportunities: { id: string; name: string; amount: number | null; currency: string; date: string }[]; state: "ready" | "failed" | "denied" }>) {
  const { FOCUS_TEXT: T } = useMessages(), locale = useLocale();
  if (state !== "ready") return (
      <p className="text-body text-muted-foreground">{state === "denied" ? T.pipelineDenied : T.sourceUnavailable}</p>
    );
  if (!opportunities.length) return (
      <p className="text-body text-muted-foreground">{T.noOpportunities}</p>
    );
  return (
    <div className="flex flex-col gap-md">{opportunities.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center justify-between gap-md text-body"><Link href={`/pipeline/${encodeURIComponent(d.id)}`} className={`${links.textLink} font-medium`}>{d.name}</Link><div className="flex items-center gap-md"><span>{d.date}</span><span className="tabular-nums">{d.amount === null ? T.unknown : Number(d.amount).toLocaleString(locale)}{d.amount !== null ? (
                <span className="ml-xs text-body-small text-muted-foreground">{d.currency}</span>
              ) : null}</span></div></div>))}</div>
  );
}
