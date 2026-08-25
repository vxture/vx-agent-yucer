import { EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { RECENCY_TEXT } from "../lib/messages";
import type { ChainRecency } from "../../domains/account/lib/health";
import type { ContactNode } from "../../domains/account/lib/health";

// Who on the decision chain anyone has actually spoken to.
//
// Deliberately a SEPARATE panel from DecisionChain rather than badges folded
// into it. The org chart says who exists; this says who has been in a recorded
// room. Merging them would let one gap masquerade as the other, and right now
// the gap most likely to be ours is the recording one.
//
// The three-way split is the whole content: warm, cold, and NEVER RECORDED are
// three different states, and the third is the one a two-state design would
// quietly turn into "cold" - which reads as a relationship problem when it is
// probably a form nobody filled in.

export interface ChainRecencyProps {
  readonly recency: ChainRecency;
  readonly nameOf: (contact: ContactNode) => string;
}

export function ChainRecencyPanel({ recency, nameOf }: ChainRecencyProps) {
  const { warm, cold, unrecorded, warmPathToEconomic, windowDays } = recency;

  if (warm.length === 0 && cold.length === 0 && unrecorded.length === 0) {
    return null;
  }

  return (
    <Section title={RECENCY_TEXT.title} description={RECENCY_TEXT.description}>
      {/* Null is a real answer here and gets its own rendering. Collapsing it
          into "no" would state a fact about the customer on the strength of a
          gap in our own record-keeping. */}
      {warmPathToEconomic === null ? (
        <StatusBadge tone="neutral">{RECENCY_TEXT.warmPathUnknown}</StatusBadge>
      ) : warmPathToEconomic ? (
        <StatusBadge tone="success" dot>
          {RECENCY_TEXT.warmPathYes}
        </StatusBadge>
      ) : (
        <StatusBadge tone="warning" dot>
          {RECENCY_TEXT.warmPathNo}
        </StatusBadge>
      )}

      {warm.length > 0 ? (
        <div>
          <span>{RECENCY_TEXT.warm(windowDays)}</span>
          {warm.map((c) => (
            <StatusBadge key={c.id} tone="success">
              {nameOf(c)}
            </StatusBadge>
          ))}
        </div>
      ) : null}

      {cold.length > 0 ? (
        <div>
          <span>{RECENCY_TEXT.cold(windowDays)}</span>
          {cold.map((c) => (
            <StatusBadge key={c.id} tone="warning">
              {nameOf(c)}
            </StatusBadge>
          ))}
        </div>
      ) : null}

      {unrecorded.length > 0 ? (
        <div>
          <span>{RECENCY_TEXT.unrecorded}</span>
          {unrecorded.map((c) => (
            <StatusBadge key={c.id} tone="neutral">
              {nameOf(c)}
            </StatusBadge>
          ))}
          <EmptyState
            title={RECENCY_TEXT.unrecorded}
            description={RECENCY_TEXT.unrecordedHint}
          />
        </div>
      ) : null}
    </Section>
  );
}
