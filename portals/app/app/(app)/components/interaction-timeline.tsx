import { EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { CHANNEL_LABEL, FIELD_TEXT } from "../lib/messages";

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
}

export function InteractionTimeline({ items }: InteractionTimelineProps) {
  if (items.length === 0) {
    return (
      <Section title={FIELD_TEXT.timelineTitle} description={FIELD_TEXT.timelineDescription}>
        <EmptyState title={FIELD_TEXT.recordEmpty} description={FIELD_TEXT.recordEmptyDescription} />
      </Section>
    );
  }

  return (
    <Section title={FIELD_TEXT.timelineTitle} description={FIELD_TEXT.timelineDescription}>
      <ol>
        {items.map((i) => (
          <li key={i.id}>
            <StatusBadge tone="neutral">{CHANNEL_LABEL[i.channel] ?? i.channel}</StatusBadge>
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
              <StatusBadge tone="warning">{FIELD_TEXT.timelineCorrects}</StatusBadge>
            ) : null}
            <p>{i.rawNote}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
