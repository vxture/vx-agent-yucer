"use client";

import { useState, type ReactNode } from "react";
import {
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  SectionHeader,
  StatusBadge,
} from "@vxture/design-ui";

import { useMessages } from "../lib/i18n/provider";
// The page's opening card: the headline, the period filter, and - folded under
// them - what the headline is made of.
//
// THE WHOLE CARD IS THE COLLAPSIBLE, not just the composition's body. Shut, this
// is the title block and nothing else: headline, caption, period tabs, and the
// control to open it. The composition's own heading folds away with its rows,
// because a heading for content that is not there is just a label taking up the
// space the fold was supposed to give back.
//
// That is why the trigger sits in the title row rather than on the composition:
// Radix needs trigger and content in one tree, and the trigger has to survive
// the thing it toggles. It also puts the control where the reader is already
// looking when they decide they are done with the detail.
//
// The composition itself is only possible since ADR-014 - a total cannot say
// what has to be delivered for it. It lives inside this card rather than as a
// section of its own because it is a decomposition OF the headline, and a
// section would present it as a separate subject.

export interface HeadlineCardProps {
  /** The headline and its caption, rendered on the server. */
  readonly headline: ReactNode;
  /** The period filter. A slot, so this card does not own the calendar. */
  readonly filter: ReactNode;
  readonly split: readonly { readonly name: string; readonly amount: number }[];
  /** Lines priced below floor, awaiting a decision. Zero renders no badge. */
  readonly awaiting: number;
}

export function HeadlineCard({
  headline,
  filter,
  split,
  awaiting,
}: HeadlineCardProps) {
  const { BOARD_TEXT, PIPELINE_TEXT } = useMessages();
  const [open, setOpen] = useState(true);

  return (
    <Card className="p-lg">
      {/* ONE child, so Card's own gap-xl never fires. Card is
          `flex flex-col gap-xl`, built for page-level cards whose sections stand
          32px apart; with two children that 32px landed on top of this block's
          own margin and the collapsed state kept reserving space it no longer
          used. */}
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="flex flex-col gap-md"
      >
        <div className="flex flex-wrap items-end justify-between gap-md">
          {headline}

          <div className="flex items-end gap-xs">
            {filter}
            <CollapsibleTrigger
              aria-label={
                open ? PIPELINE_TEXT.splitCollapse : PIPELINE_TEXT.splitExpand
              }
              className="text-muted-foreground hover:text-foreground"
            >
              <Icon name={open ? "chevron-up" : "chevron-down"} size="sm" />
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <SectionHeader
            level={3}
            icon="chart-bar"
            title={PIPELINE_TEXT.productSplit}
            description={PIPELINE_TEXT.productSplitWhy}
            /* titleSuffix, not action: the DS keeps these apart on purpose -
               action is the section's verb and sits right, titleSuffix belongs
               to the title and shares its baseline. A count of lines awaiting a
               discount decision is a property of this composition, not
               something to do to it. */
            titleSuffix={
              awaiting > 0 ? (
                <StatusBadge tone="warning">
                  {PIPELINE_TEXT.needsApproval} {awaiting}
                </StatusBadge>
              ) : undefined
            }
          />

          {split.length === 0 ? (
            <p className="text-muted-foreground mt-md text-body-sm">
              {PIPELINE_TEXT.splitEmpty}
            </p>
          ) : (
            <ul className="border-border mt-md flex w-full flex-wrap items-stretch rounded-md border">
              {split.map((p) => (
                <li
                  key={p.name}
                  /* The hairline is a left border on every item after the first,
                     which is what makes it a DIVIDER rather than a box: it
                     appears only between neighbours, and it survives wrapping -
                     a wrapped row starts a new line with no stray rule hanging
                     off its left edge, because first-of-row is still first. */
                  className="border-border min-w-0 flex-1 basis-0 px-md py-sm not-first:border-l"
                >
                  <div className="text-foreground truncate text-heading-4 tabular-nums">
                    {BOARD_TEXT.wan(p.amount)}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {p.name}
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
