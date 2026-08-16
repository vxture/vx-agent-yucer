import { MetricGrid, PageSection, type MetricGridItem } from "@vxture/design-system";
import { FIELD_TEXT } from "../lib/messages";
import type { RelationshipEvidence as Evidence } from "../../domains/account/field-service";

// What the evidence plane says about one relationship.
//
// Counts, not a score. "They have missed two of the three things they promised"
// is a sentence a salesperson can act on; a relationship health index between 0
// and 100 is a number they will learn to ignore, because nobody can say what
// would move it.
//
// The kept-rate is NULL rather than 100% when nothing has resolved yet, and the
// interface has to preserve that distinction: rendering a fresh prospect as a
// perfect record would be the single most misleading thing on this page, and it
// is exactly what a `?? 1` in the wrong place produces.

export interface RelationshipEvidenceProps {
  readonly evidence: Evidence;
  readonly now?: Date;
}

const DAY = 86_400_000;

export function RelationshipEvidencePanel({ evidence, now }: RelationshipEvidenceProps) {
  const at = now ?? new Date();
  const { lastContactAt, reliability, interactionCount } = evidence;

  const days =
    lastContactAt === null ? null : Math.floor((at.getTime() - lastContactAt.getTime()) / DAY);

  const items: MetricGridItem[] = [
    {
      id: "last-contact",
      label: FIELD_TEXT.evidenceLastContact,
      // Days, then the date. The gap is the fact; the date is the reference.
      value: days === null ? FIELD_TEXT.evidenceNever : FIELD_TEXT.evidenceDaysAgo(days),
      trend: lastContactAt?.toISOString().slice(0, 10),
      // Six weeks without contact on an account someone is meant to be working.
      tone: days === null ? "neutral" : days > 42 ? "danger" : days > 21 ? "warning" : "success",
    },
    {
      id: "interactions",
      label: FIELD_TEXT.evidenceInteractions,
      value: String(interactionCount),
      tone: "neutral",
    },
    {
      id: "they-missed",
      label: FIELD_TEXT.evidenceTheyMissed,
      value: String(reliability.theyMissed),
      tone: reliability.theyMissed > 0 ? "danger" : "neutral",
    },
    {
      id: "we-missed",
      // Ours sits beside theirs. A panel that only counted the customer's
      // failures would be a case for the defence, not a diagnosis.
      label: FIELD_TEXT.evidenceWeMissed,
      value: String(reliability.weMissed),
      tone: reliability.weMissed > 0 ? "warning" : "neutral",
    },
    {
      id: "kept-rate",
      label: FIELD_TEXT.evidenceKeptRate,
      // Null stays null. A relationship with no history is not a perfect one.
      value:
        reliability.theirKeptRate === null
          ? FIELD_TEXT.evidenceNoHistory
          : `${Math.round(reliability.theirKeptRate * 100)}%`,
      tone:
        reliability.theirKeptRate === null
          ? "neutral"
          : reliability.theirKeptRate >= 0.7
            ? "success"
            : "danger",
    },
  ];

  return (
    <PageSection title={FIELD_TEXT.evidenceTitle} description={FIELD_TEXT.evidenceDescription}>
      <MetricGrid items={items} />
    </PageSection>
  );
}
