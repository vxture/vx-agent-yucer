"use client";

import Link from "next/link";
import {
  Icon,
  PanelCard,
  PanelItem,
  PanelList,
  StatusBadge,
} from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";

// What is being fought on this theatre.
//
// THE PAGE COULD NOT SAY THIS BEFORE. An account page that never names the
// pursuits running on it is a record card, not a command post - and the reason
// it could not was an asymmetry rather than a decision: the delivery store had
// always filtered by accountId and the pipeline store had not.
//
// EVERY ROW LINKS ONWARD. The chain 战略 -> 战役 -> 信号 -> 线索 -> 商机 ->
// 交付 has to be walkable in both directions; an account that only ever
// receives links is a dead end in the middle of it. Deals link to their own
// position page. Projects link to the delivery list rather than a detail page,
// because there is no project detail route - stated here rather than dressed up
// as one.

export interface RosterDeal {
  readonly id: string;
  readonly name: string;
  readonly stageLabel: string;
  readonly amount: number | null;
  readonly currency: string;
}

export interface RosterProject {
  readonly id: string;
  readonly name: string;
  readonly healthLabel: string;
  readonly healthTone: "success" | "warning" | "danger";
}

export function TheatreRoster({
  deals,
  projects,
}: {
  readonly deals: readonly RosterDeal[];
  readonly projects: readonly RosterProject[];
}) {
  const { ACCOUNT_TEXT } = useMessages();
  const locale = useLocale();

  const total = deals.reduce((n, d) => n + (d.amount ?? 0), 0);
  const currency = deals.find((d) => d.amount != null)?.currency ?? "CNY";

  return (
    <PanelCard
      icon="target"
      title={ACCOUNT_TEXT.roster}
      description={ACCOUNT_TEXT.rosterWhy}
    >
      <PanelList>
        <PanelItem
          lead={<Icon name="table" size="sm" />}
          main={
            <span className="text-foreground text-body-md">
              {ACCOUNT_TEXT.rosterDeals}
            </span>
          }
          trail={
            <span className="text-muted-foreground text-body-sm tabular-nums">
              {deals.length > 0
                ? `${deals.length} · ${formatMoney(total, currency, locale)}`
                : ACCOUNT_TEXT.rosterNoDeals}
            </span>
          }
        />

        {deals.map((d) => (
          <PanelItem
            key={d.id}
            main={
              <Link
                href={`/pipeline/${d.id}`}
                className="text-foreground min-w-0 truncate text-body-sm hover:underline"
                title={ACCOUNT_TEXT.rosterOpenDeal}
              >
                {d.name}
              </Link>
            }
            trail={
              <span className="flex shrink-0 items-center gap-xs">
                <StatusBadge tone="neutral">{d.stageLabel}</StatusBadge>
                <Icon name="chevron-right" size="xs" />
              </span>
            }
          />
        ))}

        <PanelItem
          lead={<Icon name="cube" size="sm" />}
          main={
            <span className="text-foreground text-body-md">
              {ACCOUNT_TEXT.rosterProjects}
            </span>
          }
          trail={
            <span className="text-muted-foreground text-body-sm tabular-nums">
              {projects.length > 0
                ? projects.length
                : ACCOUNT_TEXT.rosterNoProjects}
            </span>
          }
        />

        {projects.map((p) => (
          <PanelItem
            key={p.id}
            main={
              <Link
                href="/delivery"
                className="text-foreground min-w-0 truncate text-body-sm hover:underline"
                title={ACCOUNT_TEXT.rosterOpenProjects}
              >
                {p.name}
              </Link>
            }
            trail={
              <StatusBadge tone={p.healthTone}>{p.healthLabel}</StatusBadge>
            }
          />
        ))}
      </PanelList>
    </PanelCard>
  );
}
