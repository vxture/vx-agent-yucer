"use client";

import { EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { confidenceTone } from "../lib/view-model";

// The theatre's next move.
//
// RELATIONSHIP-LEVEL, NOT DEAL-LEVEL. How to reach an untouched economic buyer,
// how to make good on a broken promise, how to break a silence - none of those
// belong to any single pursuit, which is why the deal page's plan cannot carry
// them and why this page needed its own.
//
// IT SITS AT THE FOOT OF THE PAGE, under the judgement and its evidence, and
// that order is the argument. A plan read before the evidence it rests on is a
// plan signed on trust; ADR-003 exists because the frictionless path is the
// dangerous one. The reader arrives here having already passed what it is
// based on.
//
// AN EMPTY PLAN IS NOT AN ALL-CLEAR, and it says so. No proposals means nobody
// has asked - the agent proposes when questioned or when a rule fires, and
// silence from it is not evidence of health.

export interface PlanProposal {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly rationale: string | null;
  readonly confidence: number | null;
}

export function TheatrePlan({
  proposals,
}: {
  readonly proposals: readonly PlanProposal[];
}) {
  const { ACCOUNT_TEXT, PROPOSAL_TEXT } = useMessages();

  if (proposals.length === 0) {
    return (
      <Section
        icon="target"
        title={ACCOUNT_TEXT.plan}
        description={ACCOUNT_TEXT.planWhy}
      >
        <EmptyState
          title={ACCOUNT_TEXT.planEmpty}
          description={ACCOUNT_TEXT.planEmptyWhy}
        />
      </Section>
    );
  }

  // Grouped by the capability that produced them (ADR-015), so a reader can see
  // whether they are signing a relationship move or a commercial one before
  // they read the sentence.
  const groups = [...new Set(proposals.map((p) => p.group))];

  return (
    <Section
      icon="target"
      title={ACCOUNT_TEXT.plan}
      description={ACCOUNT_TEXT.planWhy}
    >
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-sm">
          <p className="text-muted-foreground text-label-md">{g}</p>
          {proposals
            .filter((p) => p.group === g)
            .map((p) => (
              <div
                key={p.id}
                className="border-border flex min-w-0 flex-col gap-2xs rounded-md border p-md"
              >
                <div className="flex min-w-0 items-center justify-between gap-md">
                  <span className="text-foreground min-w-0 truncate text-body-md">
                    {p.title}
                  </span>
                  <StatusBadge tone={confidenceTone(p.confidence)}>
                    {p.confidence == null
                      ? PROPOSAL_TEXT.confidenceMissing
                      : `${p.confidence}%`}
                  </StatusBadge>
                </div>
                {/* The reasoning is always on the row, never behind a click: a
                    decision made without reading it is not human-in-the-loop. */}
                {p.rationale ? (
                  <p className="text-muted-foreground text-body-sm">{p.rationale}</p>
                ) : null}
              </div>
            ))}
        </div>
      ))}
    </Section>
  );
}
