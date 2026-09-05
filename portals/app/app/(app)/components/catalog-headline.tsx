"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  StatusBadge,
  ViewHeader,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// The catalogue module's header card - owner ruling 2026-09-05.
//
// The board name, the two roster tags and the gear are the always-visible row;
// what folds is the per-type breakdown. Same construction as the pipeline's
// HeadlineCard: the WHOLE card is the collapsible so the trigger lives in the
// title row and survives the thing it toggles, and the Card has exactly one
// child so its own gap-xl never fires.
//
// The breakdown copies the 承诺构成 list style by instruction: no sub-heading,
// number first, description after, wrap to a second row when there are many.
// Cells count only the LIVE rosters (on sale + in development) - retired rows
// have their own list below and counting them here would make the big numbers
// disagree with the tags beside the title.

/** One type's share of the live catalogue, in vocabulary order. */
export interface CatalogTypeStat {
  readonly key: string;
  readonly name: string;
  readonly active: number;
  readonly dev: number;
}

export function CatalogHeadline({
  activeCount,
  devCount,
  stats,
  canConfigure,
}: {
  readonly activeCount: number;
  readonly devCount: number;
  readonly stats: readonly CatalogTypeStat[];
  /** The gear goes to system config, so it hides with the write permission. */
  readonly canConfigure: boolean;
}) {
  const { CATALOG_TEXT } = useMessages();
  const [open, setOpen] = useState(true);

  return (
    <Card className="p-lg">
      <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-md">
        <ViewHeader
          icon="package"
          title={CATALOG_TEXT.title}
          description={CATALOG_TEXT.description}
          secondary={
            <span className="flex items-center gap-xs">
              <StatusBadge tone="success">{CATALOG_TEXT.tagActive(activeCount)}</StatusBadge>
              {devCount > 0 ? (
                <StatusBadge tone="info">{CATALOG_TEXT.tagDev(devCount)}</StatusBadge>
              ) : null}
            </span>
          }
          action={
            <span className="flex items-center gap-sm">
              {canConfigure ? (
                <Link
                  href="/catalog/settings"
                  aria-label={CATALOG_TEXT.settingsLink}
                  title={CATALOG_TEXT.settingsLink}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Icon name="settings" size="sm" />
                </Link>
              ) : null}
              <CollapsibleTrigger
                aria-label={open ? CATALOG_TEXT.byTypeCollapse : CATALOG_TEXT.byTypeExpand}
                className="text-muted-foreground hover:text-foreground"
              >
                <Icon name={open ? "chevron-up" : "chevron-down"} size="sm" />
              </CollapsibleTrigger>
            </span>
          }
        />

        <CollapsibleContent>
          {stats.length === 0 ? (
            <p className="text-muted-foreground text-body-sm">{CATALOG_TEXT.byTypeEmpty}</p>
          ) : (
            <ul className="border-border flex w-full flex-wrap items-stretch rounded-md border">
              {stats.map((t) => (
                <li
                  key={t.key}
                  /* Hairline between neighbours only - survives wrapping, no
                     stray rule at a wrapped row's left edge (headline-card's
                     divider argument, verbatim). */
                  className="border-border min-w-0 flex-1 basis-0 px-md py-sm not-first:border-l"
                >
                  <div className="text-foreground truncate text-heading-4 tabular-nums">
                    {t.active + t.dev}
                  </div>
                  <div className="text-muted-foreground text-body-sm">
                    <span className="text-foreground">{t.name}</span>{" "}
                    <span className="whitespace-nowrap">{CATALOG_TEXT.typeStat(t.active, t.dev)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
