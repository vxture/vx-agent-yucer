"use client";

import { useState, type ReactNode } from "react";
import {
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  ViewHeader,
} from "@vxture/design-ui";
import { moduleIcon } from "../lib/navigation";
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

/**
 * The colour a breakdown cell carries, on its dot and on its share of the bar.
 *
 * A SMALL NAMED SET, not a free colour. These map to the DS intent tokens, so
 * a stage that means trouble is the same red as every other trouble in the
 * product; a page cannot invent a seventh meaning by picking a hex.
 */
export type StatTone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

/*
 * MEASURED, NOT ASSUMED. Not every intent token is a real colour in this
 * build: `--success-text` and `--warning-text` resolve, while `--danger-text`,
 * `--danger-border` and `--warning-border` all compute to transparent - so the
 * overdue segment and its dot rendered INVISIBLE, on the one stage a
 * collections page most needs seen (measured 2026-09-06). Danger therefore
 * takes the DS's own `destructive`, which is a real token and the same red the
 * product uses for destructive intent. Same family of trap as the container
 * widths and the padding scale: a token that silently resolves to nothing.
 */
const TONE_DOT: Record<StatTone, string> = {
  neutral: "bg-accent",
  info: "bg-primary",
  success: "bg-(color:--success-text)",
  warning: "bg-(color:--warning-text)",
  danger: "bg-destructive",
  muted: "bg-muted-foreground",
};

/** One cell of the breakdown: a number, what it counts, and its split. */
export interface HeadlineStat {
  readonly key: string;
  readonly name: string;
  readonly value: number;
  /** The small print after the name - "3 在售 · 1 研发". */
  readonly note: string;
  /** Colours this cell's dot and its share of the proportion bar. */
  readonly tone?: StatTone;
}

export function ModuleHeadline({
  moduleKey,
  description,
  tags,
  action,
  stats,
  share,
  emptyNote,
}: {
  /** The nav entry this page IS. Its icon and its NAME both come from the
   * registries - a page that spelled its own name drifted from the menu the
   * moment either was edited (owner, 2026-09-05: 价目与底价 in the page,
   * 产品定价 in the menu). The description stays the page's own: it explains
   * this screen, not the menu entry. */
  readonly moduleKey: string;
  readonly description: string;
  /** StatusBadges beside the title - the roster counts. */
  readonly tags?: ReactNode;
  /** An extra control in the header's right slot, left of the fold trigger. */
  readonly action?: ReactNode;
  readonly stats: readonly HeadlineStat[];
  /**
   * Draw a proportion bar above the cells, segmented in the SAME ORDER and the
   * SAME COLOURS (owner, 2026-09-06: 一个看数字，一个直观看比例).
   *
   * Fed by the same `stats` array the numbers come from, which is the whole
   * point: order and colour cannot drift between the two readings, because
   * there is only one list. Carrying a second array for the bar would be two
   * lists to keep in step, and they would not stay in step.
   *
   * NO TITLE AND NO FIGURES ON THE BAR ITSELF. The numbers are directly
   * beneath it; printing them twice makes the reader check whether the two
   * agree instead of reading either.
   */
  readonly share?: boolean;
  readonly emptyNote: string;
}) {
  const { CATALOG_TEXT, DOMAIN_LABEL } = useMessages();
  const [open, setOpen] = useState(true);

  return (
    <Card className="p-lg">
      <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-md">
        <ViewHeader
          icon={moduleIcon(moduleKey)}
          title={DOMAIN_LABEL[moduleKey] ?? moduleKey}
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

        <CollapsibleContent className="flex flex-col gap-md">
          {share && stats.length > 0 ? (
            <div className="flex h-2xs w-full overflow-hidden rounded-full">
              {stats.map((s) => (
                <span
                  key={s.key}
                  className={TONE_DOT[s.tone ?? "neutral"]}
                  style={{ flexGrow: Math.max(s.value, 0), flexBasis: 0 }}
                  title={`${s.name} ${s.value.toLocaleString()}`}
                  aria-hidden
                />
              ))}
            </div>
          ) : null}
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
                  {/* THOUSANDS SEPARATORS, ALWAYS. This cell was written for
                      counts - 5 products, 2 segments - and reads fine raw. The
                      settlement and forecast modules put MONEY in it, and a
                      seven-digit figure with no separators is a number nobody
                      can read at a glance: 1370000 (owner, 2026-09-06). A
                      count is unaffected; 5 formats to 5. */}
                  <div className="text-foreground truncate text-heading-4 tabular-nums">
                    {s.value.toLocaleString()}
                  </div>
                  {/* 色标圆点 + 名称 + 小字 (owner, 2026-09-06). The dot is
                      what ties this cell to its share of the bar above; the
                      name alone made the reader match by position. */}
                  <div className="text-muted-foreground flex items-center gap-2xs text-body-sm">
                    {s.tone ? (
                      <span
                        aria-hidden
                        className={`size-2xs shrink-0 rounded-full ${TONE_DOT[s.tone]}`}
                      />
                    ) : null}
                    <span className="text-foreground">{s.name}</span>
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
