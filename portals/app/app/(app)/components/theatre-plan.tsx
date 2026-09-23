"use client";

import Link from "next/link";
import { EmptyState, Icon, Textarea } from "@vxture/design-ui";
import { CAPABILITIES } from "../../domains/copilot/lib/capability";
import { useMessages } from "../lib/i18n/provider";
import { confidenceTone } from "../lib/view-model";
import { Tag } from "./tag";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection } from "./collapsible-section";
import { CapBadge, CapFooter, LayerLabel } from "./panorama-annotations";

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
  readonly capabilityKey: string | null;
  readonly rationale: string | null;
  readonly confidence: number | null;
}

/**
 * 采纳后成效回看 (L6 batch four) - one accepted decision and the facts that
 * followed it. Facts only, no score (owner, 2026-09-22): see
 * domains/copilot/lib/outcome-review.ts for why a replayed score would lie.
 */
export interface PlanReview {
  readonly id: string;
  readonly title: string;
  /** The deal it was about, for a deal-level decision. */
  readonly subjectName: string | null;
  readonly decidedAt: string;
  readonly windowEnd: string;
  readonly windowClosed: boolean;
  /** A source could not be read - "could not read" is not "nothing happened". */
  readonly readFailed: boolean;
  readonly nothingFollowed: boolean;
  /** Recorded health at the decision and at the window's end (incr/0079). */
  readonly health: { readonly before: number | null; readonly after: number | null } | null;
  readonly stageMoves: ReadonlyArray<{
    id: string;
    opportunityId: string;
    opportunityName: string | null;
    from: string;
    to: string;
    date: string;
  }>;
  readonly interactions: ReadonlyArray<{ id: string; date: string; channel: string; text: string }>;
  readonly commitmentsMet: ReadonlyArray<{ id: string; statement: string; date: string }>;
  readonly commitmentsMissed: ReadonlyArray<{ id: string; statement: string; date: string }>;
}

/**
 * The review list. INSIDE the plan card, not a card of its own: it is the
 * same proposals after the decision (design T4 - no new card), and the
 * reader who just read what is proposed now can check what came of the last
 * ones. Each entry is a native <details>, closed by default.
 */
function OutcomeReviews({ reviews }: { readonly reviews: readonly PlanReview[] }) {
  const { OUTCOME_TEXT } = useMessages();
  if (reviews.length === 0) return null;
  return (
    <div className="border-border flex flex-col gap-xs border-t pt-sm">
      <p className="text-muted-foreground text-label-sm font-bold">{OUTCOME_TEXT.title}</p>
      <p className="text-muted-foreground text-body-sm">{OUTCOME_TEXT.notCausation}</p>
      {reviews.map((r) => (
        <details key={r.id} className="group/d border-border rounded-md border p-xs">
          <summary className="cursor-pointer flex list-none items-center gap-2xs [&::-webkit-details-marker]:hidden text-body-sm">
            <Icon name="chevron-right" size="xs" className="text-muted-foreground shrink-0 transition-transform group-open/d:rotate-90" />
            <span className="text-foreground font-bold">{r.title}</span>
            {r.subjectName ? <span className="text-muted-foreground"> · {r.subjectName}</span> : null}
            <span className="text-muted-foreground">
              {" "}
              · {OUTCOME_TEXT.acceptedOn(r.decidedAt)}
              {r.windowClosed ? "" : ` · ${OUTCOME_TEXT.windowOpen(r.windowEnd)}`}
            </span>
          </summary>
          <div className="mt-xs flex flex-col gap-2xs text-body-sm">
            {/* The recorded score either side of the decision - read from the
                snapshots, never re-derived (see outcome-review.ts). */}
            {r.health ? <p className="text-muted-foreground">{OUTCOME_TEXT.health(r.health.before, r.health.after)}</p> : null}
            {r.readFailed ? (
              <p className="text-destructive-text">{OUTCOME_TEXT.readFailed}</p>
            ) : r.nothingFollowed ? (
              <p className="text-muted-foreground">{OUTCOME_TEXT.nothingFollowed}</p>
            ) : (
              <>
                {r.stageMoves.map((m) => (
                  <p key={m.id}>
                    <span className="text-muted-foreground tabular-nums">{m.date}</span>{" "}
                    <Link href={`/pipeline/${m.opportunityId}`} className="underline">
                      {m.opportunityName ?? OUTCOME_TEXT.deal}
                    </Link>{" "}
                    {OUTCOME_TEXT.stageMove(m.from, m.to)}
                  </p>
                ))}
                {r.commitmentsMet.map((c) => (
                  <p key={c.id}>
                    <span className="text-muted-foreground tabular-nums">{c.date}</span>{" "}
                    <Tag tone="success">{OUTCOME_TEXT.met}</Tag> {c.statement}
                  </p>
                ))}
                {r.commitmentsMissed.map((c) => (
                  <p key={c.id}>
                    <span className="text-muted-foreground tabular-nums">{c.date}</span>{" "}
                    <Tag tone="danger">{OUTCOME_TEXT.missed}</Tag> {c.statement}
                  </p>
                ))}
                {r.interactions.map((i) => (
                  <details key={i.id} className="group/d">
                    <summary className="cursor-pointer flex list-none items-center gap-2xs [&::-webkit-details-marker]:hidden">
                      <Icon name="chevron-right" size="xs" className="text-muted-foreground shrink-0 transition-transform group-open/d:rotate-90" />
                      <span className="text-muted-foreground tabular-nums">{i.date}</span> {i.channel}
                    </summary>
                    <p className="text-muted-foreground whitespace-pre-wrap">{i.text}</p>
                  </details>
                ))}
              </>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

export function TheatrePlan({
  proposals,
  accountId,
  reviews = [],
}: {
  readonly proposals: readonly PlanProposal[];
  /** 采纳后成效回看 - accepted decisions and what followed (L6 batch four). */
  readonly reviews?: readonly PlanReview[];
  /**
   * Where "分析" sends a reader for a deeper conversation - never an inline
   * accept/reject (ADR-003: that only ever happens on the queue page). Both
   * buttons here are pointers, not writes.
   */
  readonly accountId: string;
}) {
  const { ACCOUNT_TEXT, BOARD_TEXT, PROPOSAL_TEXT, COLLAPSE_TEXT } = useMessages();
  // Folded: proposals still waiting for a person.
  const pendingSummary = proposals.length > 0 ? COLLAPSE_TEXT.planPending(proposals.length) : COLLAPSE_TEXT.planNone;

  const capCounts = new Map<string, number>();
  for (const p of proposals) {
    if (p.capabilityKey) {
      capCounts.set(p.capabilityKey, (capCounts.get(p.capabilityKey) ?? 0) + 1);
    }
  }

  const counselorSummary = (
    <div className="flex flex-col gap-sm">
      <p className="text-muted-foreground text-label-sm font-bold">
        {ACCOUNT_TEXT.planCounselorOverview}
      </p>
      <div className="flex flex-wrap gap-xs">
        {CAPABILITIES.map((cap) => {
          const count = capCounts.get(cap) ?? 0;
          return (
            <span
              key={cap}
              className="text-label-sm inline-flex items-center gap-3xs rounded-[4px] border border-[#7c3aed20] bg-[linear-gradient(135deg,#7c3aed10,#6d28d910)] px-sm py-3xs font-extrabold tracking-wider text-[#7c3aed] dark:border-[#7c3aed30] dark:bg-[linear-gradient(135deg,#7c3aed18,#6d28d918)] dark:text-[#a78bfa]"
              style={{ opacity: count > 0 ? 1 : 0.45 }}
            >
              {BOARD_TEXT.capabilityLabels[cap] ?? cap}
              {" "}
              <span className="font-mono text-label-sm">{count}</span>
            </span>
          );
        })}
      </div>
      <p className="text-muted-foreground text-body-sm">
        {ACCOUNT_TEXT.planProposalSummary(proposals.length)}
      </p>
    </div>
  );

  // tone="raised" - 设计图是全面card化 (owner, 2026-09-20; 理由见
  // org-unit-panel.tsx 同名注释). 没有 description - 去掉所有垃圾说明
  // (owner, 2026-09-20; 理由见 org-unit-panel.tsx 同名注释).
  if (proposals.length === 0) {
    return (
      <CollapsibleSection
      // This panel's own "⋮" (owner, 2026-09-23): proposals are decided in the
      // queue (ADR-003), so view and edit both go there.
      menu={{ view: { href: "/copilot" }, edit: { href: "/copilot" } }} summary={pendingSummary}
        tone="raised"
        style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
        icon="target"
        title={
          <span className="inline-flex items-center gap-xs whitespace-nowrap">
            <span>{ACCOUNT_TEXT.plan}</span>
            <LayerLabel layer="L6" />
          </span>
        }
      >
        {counselorSummary}
        <EmptyState
          title={ACCOUNT_TEXT.planEmpty}
          description={ACCOUNT_TEXT.planEmptyWhy}
        />
        <div className="border-border border-t pt-sm">
          <p className="text-muted-foreground text-label-sm mb-xs font-bold">
            {ACCOUNT_TEXT.planMemo}
          </p>
          <Textarea
            placeholder={ACCOUNT_TEXT.planMemoPlaceholder}
            rows={3}
          />
        </div>
        <OutcomeReviews reviews={reviews} />
        <CapFooter>
          <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capPlanBasic}
          <br />
          <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capPlanPro}
        </CapFooter>
      </CollapsibleSection>
    );
  }

  // Grouped by the capability that produced them (ADR-015), so a reader can see
  // whether they are signing a relationship move or a commercial one before
  // they read the sentence.
  const groups = [...new Set(proposals.map((p) => p.group))];

  return (
    <CollapsibleSection
      // This panel's own "⋮" (owner, 2026-09-23): proposals are decided in the
      // queue (ADR-003), so view and edit both go there.
      menu={{ view: { href: "/copilot" }, edit: { href: "/copilot" } }} summary={pendingSummary}
      tone="raised"
      style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
      icon="target"
      title={
        <span className="inline-flex items-center gap-xs whitespace-nowrap">
          <span>{ACCOUNT_TEXT.plan}</span>
          <LayerLabel layer="L6" />
        </span>
      }
    >
      {counselorSummary}

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
                  <Tag tone={confidenceTone(p.confidence)}>
                    {p.confidence == null
                      ? PROPOSAL_TEXT.confidenceMissing
                      : `${p.confidence}%`}
                  </Tag>
                </div>
                {/* The reasoning is always on the row, never behind a click: a
                    decision made without reading it is not human-in-the-loop. */}
                {p.rationale ? (
                  <p className="text-muted-foreground text-body-sm">{p.rationale}</p>
                ) : null}
                {/* NEITHER LINK WRITES. Both land on /copilot, where the real
                    accept/reject queue and the full conversation live -
                    "分析" only differs in prefilling a deeper question, and
                    only shows up when there is a rationale worth asking about. */}
                <div className="mt-2xs flex items-center gap-md">
                  <Link
                    href={`/copilot?account=${accountId}`}
                    className="text-primary text-body-sm font-medium hover:underline"
                  >
                    {PROPOSAL_TEXT.viewInQueue}
                  </Link>
                  {p.rationale ? (
                    <Link
                      href={`/copilot?account=${accountId}&ask=${encodeURIComponent(PROPOSAL_TEXT.analyzeQuestion(p.title, p.rationale))}`}
                      className="text-primary text-body-sm font-medium hover:underline"
                    >
                      {PROPOSAL_TEXT.analyze}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
        </div>
      ))}

      <div className="border-border border-t pt-sm">
        <p className="text-muted-foreground text-label-sm mb-xs font-bold">
          {ACCOUNT_TEXT.planMemo}
        </p>
        <Textarea
          placeholder={ACCOUNT_TEXT.planMemoPlaceholder}
          rows={3}
        />
      </div>
      <OutcomeReviews reviews={reviews} />
      <CapFooter>
        <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capPlanBasic}
        <br />
        <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capPlanPro}
      </CapFooter>
    </CollapsibleSection>
  );
}
