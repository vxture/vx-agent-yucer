"use client";
import { MemberPicker } from "./member-picker";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect, Tabs, TabsTrigger } from "@vxture/design-ui";
import { TabsList } from "./business-controls";
import { PeriodTabs } from "./period-tabs";
import { useMemberName } from "../lib/member-names";
import { useMessages } from "../lib/i18n/provider";
import { RowActions } from "./table-fittings";
import {
  attainmentHref,
  ATTAINMENT_VIEWS,
  type AttainmentView,
} from "../lib/attainment-workspace";

export function AttainmentControls({
  period,
  selection,
  perspective,
  view,
  year,
  quarters,
  years,
  owners,
  territories,
  allowWorkspace = true,
  selfSub,
  planRevision,
}: {
  readonly period: string;
  readonly selection: string;
  readonly perspective: "regions" | "team" | "personal";
  readonly view: AttainmentView;
  readonly year: string;
  readonly quarters: readonly string[];
  readonly years: readonly number[];
  readonly owners: readonly string[];
  readonly territories: readonly { id: string; name: string }[];
  readonly allowWorkspace?: boolean;
  readonly selfSub: string;
  readonly planRevision?: string | null;
}) {
  const {
    ATTAINMENT_TEXT: { workspace: T },
    ATTAINMENT_PLAN_TEXT: P,
    PIPELINE_TEXT,
  } = useMessages();
  const nameOf = useMemberName();
  const router = useRouter();
  const [pending, start] = useTransition();
  const regionsScope = allowWorkspace
    ? "workspace"
    : view === "progress"
      ? "team"
      : territories.length
        ? `territory:${territories[0].id}`
        : null;
  const select = (scope: string) =>
    start(() =>
      router.push(attainmentHref({ period, scope, view, perspective, planRevision: perspective === "regions" ? planRevision : null }), {
        scroll: false,
      }),
    );
  return (
    <div
      className="flex min-w-0 max-w-full flex-wrap items-center gap-sm"
      aria-busy={pending}
    >
      <Tabs
        value={perspective}
        onValueChange={(next) => {
          const p = next as typeof perspective;
          const scope =
            p === "personal"
              ? "personal"
              : p === "team"
                ? `owner:${selfSub}`
                : regionsScope;
          if (scope)
            start(() =>
              router.push(
                attainmentHref({ period, scope, view, perspective: p, planRevision: p === "regions" ? planRevision : null }),
                { scroll: false },
              ),
            );
        }}
      >
        <TabsList aria-label={P.perspectiveLabel}>
          <TabsTrigger className="text-body-small font-medium" value="regions" disabled={pending || !regionsScope}>
            {P.regionsView}
          </TabsTrigger>
          <TabsTrigger className="text-body-small font-medium" value="team" disabled={pending}>
            {P.teamView}
          </TabsTrigger>
          <TabsTrigger
            className="text-body-small font-medium"
            value="personal"
            disabled={pending}
            title={P.teamPersonalHint}
          >
            {P.mineView}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {perspective !== "personal" && view !== "progress" ? (
        <div className="w-44 max-w-full">
          {perspective === "regions" ? <NativeSelect
            className="h-control-xl text-body-small font-medium"
            value={selection} disabled={pending} aria-label={T.scope} onChange={e => select(e.target.value)}>
            {allowWorkspace ? <option value="workspace">{P.company}</option> : null}
            {territories.map(t => <option key={t.id} value={`territory:${t.id}`}>{t.name}</option>)}
          </NativeSelect> : <MemberPicker value={selection.startsWith("owner:") ? selection.slice(6) : ""}
            onValueChange={sub => select(`owner:${sub}`)} allowEmpty={false} label={T.scope}
            options={owners.map(sub => ({ value: sub, label: nameOf(sub) ?? T.scopeUnavailable }))} disabled={pending}/>}

        </div>
      ) : null}
      <div className="w-24">
        <NativeSelect
          className="h-control-xl text-body-small font-medium"
          value={year.slice(1)}
          disabled={pending}
          aria-label={P.periodYear}
          onChange={(e) =>
            start(() =>
              router.push(
                attainmentHref({
                  period: `Y${e.target.value}`,
                  scope: selection,
                  view,
                  perspective,
                }),
                { scroll: false },
              ),
            )
          }
        >
          {years.map((y) => (
            <option key={y} value={y}>
              Y{y}
            </option>
          ))}
        </NativeSelect>
      </div>
      <PeriodTabs
        value={period}
        periods={quarters}
        yearLabel={year}
        yearText={P.periodYear}
        compact
        resetParams={["snapshot", "evidence"]}
      />
    </div>
  );
}

export function AttainmentViewActions({
  value,
  reportingScope = "workspace",
  allowForecast = true,
}: {
  readonly value: AttainmentView;
  readonly reportingScope?: string;
  readonly allowForecast?: boolean;
}) {
  const {
    ATTAINMENT_TEXT: { workspace: T },
    ATTAINMENT_DEPLOYMENT_TEXT: D,
    DS_LABELS,
  } = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const selectView = (view: AttainmentView) => {
    if (view === value) return;
    const query = new URLSearchParams(params.toString());
    query.set("view", view);
    if (
      view !== "progress" &&
      (query.get("scope") === "team" ||
        (!query.has("scope") && reportingScope !== "workspace"))
    )
      query.set("scope", reportingScope);
    if (!query.get("period") || query.get("period") === "all")
      query.set("period", `Y${new Date().getUTCFullYear()}`);
    if (view !== "history") query.delete("snapshot");
    start(() =>
      router.push(`/attainment?${query.toString()}`, { scroll: false }),
    );
  };
  const icons = { progress: "chart-bar", review: "list-checks", history: "archive" } as const;
  const items = ATTAINMENT_VIEWS.filter(view => view !== value && (view === "progress" || allowForecast)).map(view => ({
    id: view, label: view === "history" ? D.history : T[view], icon: icons[view], onSelect: () => selectView(view),
  }));
  return items.length ? <RowActions label={DS_LABELS.actionMenu} items={items} disabled={pending}/> : null;
}
