"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button, NativeSelect, Tabs, TabsTrigger } from "@vxture/design-ui";
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
  view,
  year,
  quarters,
  owners,
  territories,
}: {
  readonly period: string;
  readonly selection: string;
  readonly view: AttainmentView;
  readonly year: string;
  readonly quarters: readonly string[];
  readonly owners: readonly string[];
  readonly territories: readonly { id: string; name: string }[];
}) {
  const {
    ATTAINMENT_TEXT: { workspace: T },
    PIPELINE_TEXT,
  } = useMessages();
  const nameOf = useMemberName();
  const router = useRouter();
  const [pending, start] = useTransition();
  const personal = selection === "personal";
  const historicalPeriod =
    period !== "all" && period !== year && !quarters.includes(period);
  const select = (scope: string) =>
    start(() =>
      router.push(attainmentHref({ period, scope, view }), { scroll: false }),
    );
  return (
    <div
      className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-sm"
      aria-busy={pending}
    >
      <div
        className="flex items-center gap-xs"
        role="group"
        aria-label={T.scope}
      >
        <Button asChild size="md" variant={personal ? "ghost" : "secondary"}>
          <Link
            href={attainmentHref({ period, scope: "workspace", view })}
            aria-current={!personal ? "page" : undefined}
          >
            {T.team}
          </Link>
        </Button>
        <Button asChild size="md" variant={personal ? "secondary" : "ghost"}>
          <Link
            href={attainmentHref({ period, scope: "personal", view })}
            aria-current={personal ? "page" : undefined}
          >
            {T.mine}
          </Link>
        </Button>
      </div>
      {!personal ? (
        <div className="w-44 max-w-full">
          <NativeSelect
            className="h-control-xl"
            value={selection}
            disabled={pending}
            aria-label={T.scope}
            onChange={(e) => select(e.target.value)}
          >
            <option value="workspace">{T.wholeTeam}</option>
            {selection !== "workspace" &&
            !territories.some((t) => selection === `territory:${t.id}`) &&
            !owners.some((sub) => selection === `owner:${sub}`) ? (
              <option value={selection}>{T.scopeUnavailable}</option>
            ) : null}
            {territories.map((t) => (
              <option key={t.id} value={`territory:${t.id}`}>
                {PIPELINE_TEXT.scopeTerritory(t.name)}
              </option>
            ))}
            {owners.map((sub) => (
              <option key={sub} value={`owner:${sub}`}>
                {PIPELINE_TEXT.scopeOwner(nameOf(sub) ?? sub)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      <PeriodTabs
        value={period}
        periods={historicalPeriod ? [...quarters, period] : quarters}
        yearLabel={year}
        compact
        allLabel={PIPELINE_TEXT.periodAll}
      />
    </div>
  );
}

export function AttainmentViewTabs({
  value,
}: {
  readonly value: AttainmentView;
}) {
  const {
    ATTAINMENT_TEXT: { workspace: T },
  } = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <Tabs
      value={value}
      aria-busy={pending}
      onValueChange={(view) => {
        const query = new URLSearchParams(params.toString());
        query.set("view", view);
        start(() =>
          router.push(`/attainment?${query.toString()}`, { scroll: false }),
        );
      }}
    >
      <TabsList
        aria-label={T.views}
        className="max-w-full justify-start overflow-x-auto"
      >
        {ATTAINMENT_VIEWS.map((view) => (
          <TabsTrigger value={view} key={view} disabled={pending}>
            {T[view]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
