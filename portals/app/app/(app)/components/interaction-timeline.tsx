"use client";

import { useState } from "react";
import {
  Button,
  EmptyState,
  Icon,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// What actually happened, newest first.
//
// The note is shown VERBATIM. Everything downstream - the health score, the
// decision chain, and eventually every judgement the agent makes - cites these
// rows, so the thing a reader can open must be the thing that was cited. A
// tidied-up summary displayed in place of the original would make provenance a
// story rather than a fact.
//
// A server component: past facts, nothing to interact with.

export interface TimelineItem {
  readonly id: string;
  readonly channel: string;
  readonly occurredAt: Date;
  readonly actorSub: string;
  readonly rawNote: string;
  readonly correctsInteractionId: string | null;
}

export interface InteractionTimelineProps {
  readonly items: readonly TimelineItem[];
  /**
   * How many to show before the fold. Absent = all of them.
   *
   * A DETAIL PAGE BOUNDS IT; a page that is only the timeline does not. The
   * account page carries seven other dimensions, and dumping twenty-three notes
   * into the middle of them buries every one of the others - the reader loses
   * the map to gain a history they did not ask for yet.
   */
  readonly limit?: number;
}

export function InteractionTimeline({
  items,
  limit,
}: InteractionTimelineProps) {
  const { CHANNEL_LABEL, FIELD_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  // Expands IN PLACE rather than opening a page. A note is read in the context
  // of the account it belongs to, and a route that shows the same notes without
  // the health score beside them is a worse version of this page.
  const bounded = limit !== undefined && !open && items.length > limit;
  const shown = bounded ? items.slice(0, limit) : items;
  if (items.length === 0) {
    return (
      <Section
        title={FIELD_TEXT.timelineTitle}
        description={FIELD_TEXT.timelineDescription}
      >
        <EmptyState
          title={FIELD_TEXT.recordEmpty}
          description={FIELD_TEXT.recordEmptyDescription}
        />
      </Section>
    );
  }

  return (
    <Section
      title={FIELD_TEXT.timelineTitle}
      description={FIELD_TEXT.timelineDescription}
      action={
        limit !== undefined && items.length > limit ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
            {open
              ? FIELD_TEXT.timelineCollapse
              : FIELD_TEXT.timelineShown(limit, items.length)}
            <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
          </Button>
        ) : null
      }
    >
      <ol>
        {shown.map((i) => (
          <li key={i.id}>
            <StatusBadge tone="neutral">
              {CHANNEL_LABEL[i.channel] ?? i.channel}
            </StatusBadge>
            <time dateTime={i.occurredAt.toISOString()}>
              {i.occurredAt.toISOString().slice(0, 16).replace("T", " ")}
            </time>
            <span>
              {FIELD_TEXT.timelineBy}: {i.actorSub}
            </span>
            {/* A correction is a new row pointing at the old one, and both stay.
                Saying so is the difference between "the record changed" and
                "somebody corrected the record". */}
            {i.correctsInteractionId ? (
              <StatusBadge tone="warning">
                {FIELD_TEXT.timelineCorrects}
              </StatusBadge>
            ) : null}
            <p>{i.rawNote}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
