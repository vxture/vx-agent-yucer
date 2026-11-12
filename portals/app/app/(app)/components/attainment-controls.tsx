"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button, Icon, NativeSelect, Tabs, TabsTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
import { TabsList } from "./business-controls";
import { PeriodTabs } from "./period-tabs";
import { useMemberName } from "../lib/member-names";
import { useMessages } from "../lib/i18n/provider";
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
      router.push(attainmentHref({ period, scope, view, perspective }), {
        scroll: false,
      }),
    );
  return (
    <div
      className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-sm"
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
                attainmentHref({ period, scope, view, perspective: p }),
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
          <NativeSelect
            className="h-control-xl text-body-small font-medium"
            value={selection}
            disabled={pending}
            aria-label={T.scope}
            onChange={(e) => select(e.target.value)}
          >
            {perspective === "regions" ? (
              <>
                {allowWorkspace ? (
                  <option value="workspace">{P.company}</option>
                ) : null}
                {territories.map((t) => (
                  <option key={t.id} value={`territory:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </>
            ) : (
              owners.map((sub) => (
                <option key={sub} value={`owner:${sub}`}>
                  {nameOf(sub) ?? T.scopeUnavailable}
                </option>
              ))
            )}
          </NativeSelect>
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
        resetParams={["snapshot", "planRevision"]}
      />
    </div>
  );
}

export function AttainmentViewActions({
  value,
  reportingScope = "workspace",
}: {
  readonly value: AttainmentView;
  readonly reportingScope?: string;
}) {
  const {
    ATTAINMENT_TEXT: { workspace: T },
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
  return (
    <div className="flex shrink-0 items-center gap-2xs" role="group" aria-label={T.views} aria-busy={pending} data-attainment-view-actions>
      {ATTAINMENT_VIEWS.map((view) => (
        <Tooltip key={view}>
          <TooltipTrigger asChild>
            <Button
              size="icon-xl"
              variant={value === view ? "secondary" : "ghost"}
              aria-label={T[view]}
              aria-pressed={value === view}
              disabled={pending}
              onClick={() => selectView(view)}
            >
              <Icon name={icons[view]} size="md" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{T[view]}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
