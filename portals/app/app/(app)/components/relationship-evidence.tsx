import { MetricGrid, Section, type MetricGridItem } from "@vxture/design-ui";
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

export function RelationshipEvidencePanel({
  evidence,
  now,
}: RelationshipEvidenceProps) {
  const at = now ?? new Date();
  const { lastContactAt, reliability, interactionCount } = evidence;

  const days =
    lastContactAt === null
      ? null
      : Math.floor((at.getTime() - lastContactAt.getTime()) / DAY);

  const items: MetricGridItem[] = [
    {
      id: "last-contact",
      label: FIELD_TEXT.evidenceLastContact,
      // Days, then the date. The gap is the fact; the date is the reference.
      value:
        days === null
          ? FIELD_TEXT.evidenceNever
          : FIELD_TEXT.evidenceDaysAgo(days),
      trend: lastContactAt?.toISOString().slice(0, 10),
      // Six weeks without contact on an account someone is meant to be working.
      tone:
        days === null
          ? "neutral"
          : days > 42
            ? "danger"
            : days > 21
              ? "warning"
              : "success",
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
    <Section
      title={FIELD_TEXT.evidenceTitle}
      description={FIELD_TEXT.evidenceDescription}
    >
      {/* columns={2}, and the third time this has come up is worth naming as a
          rule: the DS's grids break on the VIEWPORT while every grid in this
          product sits in a pane sized by the shell. On the theatre page the
          centre column is 768px - viewport, less a 320px dossier, a 400px deck
          and the insets - so four cards get ~170 each and their labels clip to
          one glyph. Two columns is the only lever MetricGrid offers; a
          container query is what the case wants, and the DS has none. */}
      <MetricGrid items={items} columns={2} />
    </Section>
  );
}
