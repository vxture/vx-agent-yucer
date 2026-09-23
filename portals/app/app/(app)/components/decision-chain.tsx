"use client";

import { Fragment, type ReactNode } from "react";
import {
  EmptyState,
  Section,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vxture/design-ui";
import type {
  ChainCoverage,
  ContactNode,
} from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

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
  /** The form that can change the answer above. Absent on surfaces that only read. */
  readonly linkForm?: ReactNode;
  /**
   * Which deal this chain belongs to - incr/0027.
   *
   * REQUIRED IN PRACTICE ON THE CUSTOMER PAGE, where several of these now sit
   * one above the other. Without it two committees for two different purchases
   * render under the same heading and read as one contradictory answer.
   */
  readonly title?: string;
  /** Person id -> name. A coach or blocker badge used to print the raw id -
   *  a UUID in front of someone who is meant to go and talk to that person. */
  readonly names?: Readonly<Record<string, string>>;
}

export function DecisionChain({
  coverage,
  contacts,
  linkForm,
  title,
  names = {},
}: DecisionChainProps) {
  const { CHAIN_TEXT, DECISION_ROLE_LABEL } = useMessages();
  // NOT tone="raised" here (reverted, owner 2026-09-20) - this component is
  // SHARED with the pipeline detail page (pipeline/[id]/page.tsx), which
  // keeps every other Section on the default tone; account-detail's own
  // decision-chain card was rebuilt as decision-chain-detail.tsx instead of
  // reusing this one, specifically so this file's look-and-feel for the
  // pipeline page would not change as a side effect of that page's redesign.
  if (contacts.length === 0) {
    return (
      <Section title={title ?? CHAIN_TEXT.title} description={CHAIN_TEXT.description}>
        <EmptyState
          title={CHAIN_TEXT.emptyTitle}
          description={CHAIN_TEXT.emptyDescription}
        />
        {linkForm ? <Fragment key="link-form">{linkForm}</Fragment> : null}
      </Section>
    );
  }

  const hasEconomicBuyer = contacts.some(
    (c) => c.decisionRole === "economic" && c.status === "active",
  );

  return (
    <Section title={title ?? CHAIN_TEXT.title} description={CHAIN_TEXT.description}>
      {/* Reachability leads. Coverage is secondary and rendered below it. */}
      {coverage.economicBuyerUnreachable ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <StatusBadge tone="danger" dot>
                {hasEconomicBuyer
                  ? CHAIN_TEXT.unreachable
                  : CHAIN_TEXT.noEconomicBuyer}
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

      {/* Only when something is covered - a bare "已覆盖" label with nothing
          after it read as a rendering fault. */}
      {coverage.covered.length > 0 ? (
        <div className="flex flex-wrap items-center gap-xs">
          <span>{CHAIN_TEXT.covered}</span>
          {coverage.covered.map((role) => (
            <Tag key={role}>
              {DECISION_ROLE_LABEL[role] ?? role}
            </Tag>
          ))}
        </div>
      ) : null}

      {coverage.missing.length > 0 ? (
        <div className="flex flex-wrap items-center gap-xs">
          <span>{CHAIN_TEXT.missing}</span>
          {coverage.missing.map((role) => (
            <StatusBadge key={role} tone="warning">
              {DECISION_ROLE_LABEL[role] ?? role}
            </StatusBadge>
          ))}
        </div>
      ) : null}

      {coverage.coaches.length > 0 ? (
        <div className="flex flex-wrap items-center gap-xs">
          <span>{CHAIN_TEXT.coaches}</span>
          {/* Ordered by influence, so the copilot's "talk to X next" and this
              list name the same person. */}
          {coverage.coaches.map((c) => (
            <StatusBadge key={c.id} tone="info">
              {names[c.id] ?? CHAIN_TEXT.unnamedPerson}
              {c.influence != null
                ? ` (${CHAIN_TEXT.influence} ${c.influence})`
                : ""}
            </StatusBadge>
          ))}
        </div>
      ) : null}

      {coverage.blockers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-xs">
          <span>{CHAIN_TEXT.blockers}</span>
          {coverage.blockers.map((c) => (
            <StatusBadge key={c.id} tone="danger">
              {names[c.id] ?? CHAIN_TEXT.unnamedPerson}
            </StatusBadge>
          ))}
        </div>
      ) : null}

      {/* The action that can change the verdict above, in the place the verdict
          is delivered. Sending a rep elsewhere to fix what this panel just told
          them is how a finding turns into something people learn to ignore. */}
      {/* A KEYED FRAGMENT, and the key is load-bearing.

          `linkForm` is the one child of this Section created somewhere else -
          the page builds the element and hands it down as a prop. React reports
          the component that RECEIVED the children (Section) and the one that
          CREATED the element (AccountDetailPage), and names neither this file
          nor this line, which is why the warning read as a Design System defect
          for a while. It is not: the same warning appears with a bare <div> in
          Section's place. The layer that assembles the children array is this
          one, so the key belongs here.

          Measured: with the key, the account detail page reports zero issues;
          without it, one.

          Do not silence this instead. Children.toArray, or a wrapper element,
          would hide a real defect - four of the siblings above are conditional,
          so when one disappears the ones after it shift into earlier indices,
          React matches by index, and state carries across to a different
          sibling. A stable key is what prevents that. Quieting the console is
          a side effect of the fix, not the point of it. */}
      {linkForm ? <Fragment key="link-form">{linkForm}</Fragment> : null}
    </Section>
  );
}
