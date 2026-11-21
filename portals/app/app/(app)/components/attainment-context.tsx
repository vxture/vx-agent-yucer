"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Card, CardContent, Icon, NativeSelect } from "@vxture/design-ui";
import type { AttainmentRevision } from "../../domains/planning/attainment-plan";
import { attainmentHref, planningHref, type AttainmentView } from "../lib/attainment-workspace";
import { focusHref } from "../lib/focus-workspace";
import { useMessages } from "../lib/i18n/provider";
import { PageActionButton } from "./page-header-actions";
import { TitleHelp } from "./title-help";
import { Tag } from "./tag";

export function AttainmentContext({ period, scope, scopeName, view, selected, current, versions, canPlan, canFocus, controls }: {
  readonly period: string; readonly scope: string; readonly scopeName: string; readonly view: AttainmentView;
  readonly selected: AttainmentRevision | null; readonly current: AttainmentRevision | null;
  readonly versions: readonly AttainmentRevision[]; readonly canPlan: boolean; readonly canFocus: boolean;
  readonly controls?: ReactNode;
}) {
  const { ATTAINMENT_DEPLOYMENT_TEXT: T } = useMessages();
  const router = useRouter(), [pending, start] = useTransition();
  const year = Number(period.replace(/^Y/, "").slice(0, 4));
  const region = scope.startsWith("territory:") ? scope.slice(10) : null;
  const personal = scope === "personal" || scope.startsWith("owner:");
  const historical = !!selected && selected.id !== current?.id;
  return <Card><CardContent className="flex flex-col gap-md text-body" data-attainment-context>
    {controls ? <div className="border-b border-border pb-md">{controls}</div> : null}
    <div className="flex flex-wrap items-center justify-between gap-md">
    <div className="flex min-w-0 flex-wrap items-center gap-sm">
      <Icon name="target" size="sm"/><span>{scopeName}</span><span className="text-muted-foreground">{period}</span>
      <Tag>{historical ? T.historical : T.live}</Tag>
      <TitleHelp topic={T.title}>{T.help}</TitleHelp>
      {!personal && selected && versions.length > 1 ? <NativeSelect className="w-auto" aria-label={T.chooseVersion} value={selected.id} disabled={pending}
        onChange={e => start(() => router.push(attainmentHref({ period, scope, view, planRevision: e.target.value }), { scroll: false }))}>
        {versions.map(v => <option key={v.id} value={v.id}>V{v.version}{v.id === current?.id ? ` / ${T.latest}` : ""}</option>)}
      </NativeSelect> : <span className="text-muted-foreground">{personal || !selected ? T.legacy : `${T.comparison} V${selected.version}`}</span>}
    </div>
    <div className="flex flex-wrap items-center gap-sm">
      {historical ? <PageActionButton asChild><Link href={attainmentHref({ period, scope, view })}>{T.latest}</Link></PageActionButton> : null}
      {canFocus && !personal ? <PageActionButton asChild><Link href={focusHref({ year, revisionId: selected?.id, regionId: region, period })}>{T.focus}</Link></PageActionButton> : null}
      {canPlan && !personal ? <PageActionButton asChild><Link href={planningHref(year, region, selected?.id, period)}>{T.planning}</Link></PageActionButton> : null}
    </div>
    </div>
  </CardContent></Card>;
}
