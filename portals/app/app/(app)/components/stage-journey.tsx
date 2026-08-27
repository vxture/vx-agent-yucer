import { EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import type { Stage } from "../../domains/pipeline/lib/stage";
import { getMessages } from "../lib/i18n/server";
import { STAGE_TONE } from "../lib/view-model";

// The stage journal, oldest first.
//
// This surface exists because of the rule that every stage change writes an
// event: velocity and conversion are computed from opportunity_stage_event and
// never reconstructed from updated_at, which only remembers the last write. A
// journal nobody can read is a journal nobody checks, so the history is shown
// with the thing it is actually for - the INTERVAL between moves. "Sat in
// validation for 61 days" is the finding; "moved on 2026-06-15" is trivia.
//
// A server component: it renders past facts and has nothing to interact with.

export interface StageJourneyEvent {
  readonly id: string;
  readonly fromStage: string | null;
  readonly toStage: string;
  readonly reason: string | null;
  readonly actorSub: string | null;
  readonly occurredAt: Date;
}

export interface StageJourneyProps {
  readonly events: readonly StageJourneyEvent[];
  /** Used to date the interval the deal has spent in its CURRENT stage. */
  readonly now?: Date;
}

const DAY = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY));
}

export async function StageJourney({ events, now }: StageJourneyProps) {
  const { OPPORTUNITY_TEXT, STAGE_LABEL } = await getMessages();
  if (events.length === 0) {
    return (
      <Section
        title={OPPORTUNITY_TEXT.journeyTitle}
        description={OPPORTUNITY_TEXT.journeyDescription}
      >
        <EmptyState
          title={OPPORTUNITY_TEXT.journeyEmptyTitle}
          description={OPPORTUNITY_TEXT.journeyEmptyDescription}
        />
      </Section>
    );
  }

  const asOf = now ?? new Date();
  const first = events[0];

  return (
    <Section
      title={OPPORTUNITY_TEXT.journeyTitle}
      description={OPPORTUNITY_TEXT.journeyDescription}
      action={
        <StatusBadge tone="neutral">
          {OPPORTUNITY_TEXT.journeyTotal(daysBetween(first.occurredAt, asOf))}
        </StatusBadge>
      }
    >
      <ol>
        {events.map((e, i) => {
          // The interval a stage LASTED: from this event until the next one, or
          // until now for the stage the deal currently sits in.
          const until = i + 1 < events.length ? events[i + 1].occurredAt : asOf;
          const isCurrent = i === events.length - 1;
          return (
            <li key={e.id}>
              <StatusBadge tone={STAGE_TONE[e.toStage as Stage]} dot>
                {STAGE_LABEL[e.toStage as Stage] ?? e.toStage}
              </StatusBadge>

              <span>
                {e.fromStage
                  ? `${OPPORTUNITY_TEXT.journeyFrom} ${STAGE_LABEL[e.fromStage as Stage] ?? e.fromStage}`
                  : OPPORTUNITY_TEXT.journeyCreated}
              </span>

              <time dateTime={e.occurredAt.toISOString()}>
                {e.occurredAt.toISOString().slice(0, 10)}
              </time>

              <StatusBadge tone={isCurrent ? "info" : "neutral"}>
                {OPPORTUNITY_TEXT.journeyDuration(
                  daysBetween(e.occurredAt, until),
                )}
              </StatusBadge>
              {isCurrent ? (
                <StatusBadge tone="info">
                  {OPPORTUNITY_TEXT.journeyCurrent}
                </StatusBadge>
              ) : null}

              <span>
                {OPPORTUNITY_TEXT.journeyBy}:{" "}
                {/* A null actor is an agent-driven move, which the audit column
                    allows explicitly. Rendering it as "-" would make a machine
                    decision look like a missing record. */}
                {e.actorSub ?? OPPORTUNITY_TEXT.journeyByAgent}
              </span>

              {e.reason ? (
                <p>
                  {OPPORTUNITY_TEXT.journeyReason}: {e.reason}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
