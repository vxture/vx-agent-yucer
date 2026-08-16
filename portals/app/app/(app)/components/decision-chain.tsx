"use client";

import {
  EmptyState,
  PageSection,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vxture/design-system";
import type { ChainCoverage, ContactNode } from "../../domains/account/lib/health";
import { CHAIN_TEXT, DECISION_ROLE_LABEL } from "../lib/messages";

// The decision chain.
//
// The headline is REACHABILITY, not coverage, and that ordering is the whole
// point of the surface. "We have an economic buyer on file" and "someone can
// introduce us to them" are different facts, and only the second advances a
// deal. A chain view that led with a green "all roles covered" badge while
// nobody could actually reach the buyer would be worse than no view at all - it
// would give a rep confidence they have not earned.
//
// The traversal behind it skips opposed_to edges and inactive contacts, so an
// account whose only path runs through a departed champion or an active
// opponent reports unreachable rather than fine.

export interface DecisionChainProps {
  readonly coverage: ChainCoverage;
  readonly contacts: readonly ContactNode[];
}

export function DecisionChain({ coverage, contacts }: DecisionChainProps) {
  if (contacts.length === 0) {
    return (
      <PageSection title={CHAIN_TEXT.title} description={CHAIN_TEXT.description}>
        <EmptyState title={CHAIN_TEXT.emptyTitle} description={CHAIN_TEXT.emptyDescription} />
      </PageSection>
    );
  }

  const hasEconomicBuyer = contacts.some((c) => c.decisionRole === "economic" && c.status === "active");

  return (
    <PageSection title={CHAIN_TEXT.title} description={CHAIN_TEXT.description}>
      {/* Reachability leads. Coverage is secondary and rendered below it. */}
      {coverage.economicBuyerUnreachable ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <StatusBadge tone="danger" dot>
                {hasEconomicBuyer ? CHAIN_TEXT.unreachable : CHAIN_TEXT.noEconomicBuyer}
              </StatusBadge>
            </span>
          </TooltipTrigger>
          <TooltipContent>{CHAIN_TEXT.unreachableHint}</TooltipContent>
        </Tooltip>
      ) : (
        <StatusBadge tone="success" dot>
          {CHAIN_TEXT.reachable}
        </StatusBadge>
      )}

      <div>
        <span>{CHAIN_TEXT.covered}</span>
        {coverage.covered.map((role) => (
          <StatusBadge key={role} tone="neutral">
            {DECISION_ROLE_LABEL[role] ?? role}
          </StatusBadge>
        ))}
      </div>

      {coverage.missing.length > 0 ? (
        <div>
          <span>{CHAIN_TEXT.missing}</span>
          {coverage.missing.map((role) => (
            <StatusBadge key={role} tone="warning">
              {DECISION_ROLE_LABEL[role] ?? role}
            </StatusBadge>
          ))}
        </div>
      ) : null}

      {coverage.coaches.length > 0 ? (
        <div>
          <span>{CHAIN_TEXT.coaches}</span>
          {/* Ordered by influence, so the copilot's "talk to X next" and this
              list name the same person. */}
          {coverage.coaches.map((c) => (
            <StatusBadge key={c.id} tone="info">
              {c.id}
              {c.influence != null ? ` (${CHAIN_TEXT.influence} ${c.influence})` : ""}
            </StatusBadge>
          ))}
        </div>
      ) : null}

      {coverage.blockers.length > 0 ? (
        <div>
          <span>{CHAIN_TEXT.blockers}</span>
          {coverage.blockers.map((c) => (
            <StatusBadge key={c.id} tone="danger">
              {c.id}
            </StatusBadge>
          ))}
        </div>
      ) : null}
    </PageSection>
  );
}
