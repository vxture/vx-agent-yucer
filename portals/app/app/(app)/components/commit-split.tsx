"use client";

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Icon, SectionHeader, StatusBadge } from "@vxture/design-ui";
import { BOARD_TEXT, PIPELINE_TEXT } from "../lib/messages";

// What the committed money is FOR, folded into the page's opening block.
//
// Only possible since ADR-014: a total cannot say what has to be delivered for
// it. It sits with the headline rather than as a section of its own because it
// is a decomposition OF that headline - the same money, read by product line -
// and a separate section would present it as a separate subject.
//
// COLLAPSIBLE, OPEN BY DEFAULT. It is the second thing worth knowing after the
// number itself, so it should not cost a click on arrival; but it is also the
// part a reader is done with first, and on a page with three sections below it
// the ability to fold it away is what keeps those sections above the fold.
//
// ONE ROW, DIVIDED. Laid out as a filled row with hairlines between the figures
// rather than as wrapped blocks: these are parts of one total, and a rule
// between them says "these belong to the same reading" in a way that whitespace
// alone does not. Equal columns, so no line claims more importance by being
// wider than its neighbour.

export interface CommitSplitProps {
  readonly split: readonly { readonly name: string; readonly amount: number }[];
  /** Lines priced below floor, awaiting a decision. Zero renders no badge. */
  readonly awaiting: number;
}

export function CommitSplit({ split, awaiting }: CommitSplitProps) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SectionHeader
        level={3}
        title={PIPELINE_TEXT.productSplit}
        /* The description folds with the body. Left standing it made the
           collapsed state two lines of prose under a heading with nothing
           beneath them - collapsed in name only. Shut, this is one row: icon,
           title, the pending-approval count, and the control to open it. */
        description={open ? PIPELINE_TEXT.productSplitWhy : undefined}
        icon="chart-bar"
        /* titleSuffix, not action: the DS keeps these apart on purpose - action
           is the section's verb and sits right, titleSuffix belongs to the
           title and sits against it. A count of lines awaiting a discount
           decision is a property of this composition, not something to do to
           it, so it rides the title and shares its baseline. */
        titleSuffix={
          awaiting > 0 ? (
            <StatusBadge tone="warning">
              {PIPELINE_TEXT.needsApproval} {awaiting}
            </StatusBadge>
          ) : undefined
        }
        action={
          <CollapsibleTrigger
            aria-label={open ? PIPELINE_TEXT.splitCollapse : PIPELINE_TEXT.splitExpand}
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon name={open ? "chevron-up" : "chevron-down"} size="sm" />
          </CollapsibleTrigger>
        }
      />

      <CollapsibleContent>
        {split.length === 0 ? (
          <p className="text-muted-foreground mt-md text-body-sm">{PIPELINE_TEXT.splitEmpty}</p>
        ) : (
          <ul className="border-border mt-md flex w-full flex-wrap items-stretch rounded-md border">
            {split.map((p) => (
              <li
                key={p.name}
                /* The hairline is a left border on every item after the first,
                   which is what makes it a DIVIDER rather than a box: it appears
                   only between neighbours, and it survives wrapping - a wrapped
                   row starts a new line with no stray rule hanging off its left
                   edge, because first-of-row is still first. */
                className="border-border min-w-0 flex-1 basis-0 px-md py-sm not-first:border-l"
              >
                <div className="text-foreground truncate text-heading-4 tabular-nums">
                  {BOARD_TEXT.wan(p.amount)}
                </div>
                <div className="text-muted-foreground truncate text-xs">{p.name}</div>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
