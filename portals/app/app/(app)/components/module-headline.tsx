"use client";

import { useState, type ReactNode } from "react";
import {
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  ViewHeader,
  type IconName,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// A module page's header card - owner ruling 2026-09-05, generalised when the
// price book was told to follow the catalogue's pattern and layout.
//
// The board name, its tags and any header action are the always-visible row;
// what folds is the per-type breakdown. Same construction as the pipeline's
// HeadlineCard: the WHOLE card is the collapsible so the trigger lives in the
// title row and survives the thing it toggles, and the Card has exactly one
// child so its own gap-xl never fires.
//
// The breakdown is the 承诺构成 list style by instruction: no sub-heading,
// number first, description after, wrapping to a second row when there are
// many. What the number MEANS is each page's business - this component only
// promises they will look the same.

/** One cell of the breakdown: a number, what it counts, and its split. */
export interface HeadlineStat {
  readonly key: string;
  readonly name: string;
  readonly value: number;
  /** The small print after the name - "3 在售 · 1 研发". */
  readonly note: string;
}

export function ModuleHeadline({
  icon,
  title,
  description,
  tags,
  action,
  stats,
  emptyNote,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  /** StatusBadges beside the title - the roster counts. */
  readonly tags?: ReactNode;
  /** An extra control in the header's right slot, left of the fold trigger. */
  readonly action?: ReactNode;
  readonly stats: readonly HeadlineStat[];
  readonly emptyNote: string;
}) {
  const { CATALOG_TEXT } = useMessages();
  const [open, setOpen] = useState(true);

  return (
    <Card className="p-lg">
      <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-md">
        <ViewHeader
          icon={icon}
          title={title}
          description={description}
          secondary={tags ? <span className="flex items-center gap-xs">{tags}</span> : undefined}
          action={
            <span className="flex items-center gap-sm">
              {action}
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
            <p className="text-muted-foreground text-body-sm">{emptyNote}</p>
          ) : (
            <ul className="border-border flex w-full flex-wrap items-stretch rounded-md border">
              {stats.map((s) => (
                <li
                  key={s.key}
                  /* Hairline between neighbours only - survives wrapping, no
                     stray rule at a wrapped row's left edge (headline-card's
                     divider argument, verbatim). */
                  className="border-border min-w-0 flex-1 basis-0 px-md py-sm not-first:border-l"
                >
                  <div className="text-foreground truncate text-heading-4 tabular-nums">
                    {s.value}
                  </div>
                  <div className="text-muted-foreground text-body-sm">
                    <span className="text-foreground">{s.name}</span>{" "}
                    <span className="whitespace-nowrap">{s.note}</span>
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
