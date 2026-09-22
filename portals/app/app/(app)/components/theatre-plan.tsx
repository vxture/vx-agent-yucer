"use client";

import Link from "next/link";
import { EmptyState, Section, Textarea } from "@vxture/design-ui";
import { CAPABILITIES } from "../../domains/copilot/lib/capability";
import { useMessages } from "../lib/i18n/provider";
import { confidenceTone } from "../lib/view-model";
import { Tag } from "./tag";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
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

export function TheatrePlan({
  proposals,
  accountId,
}: {
  readonly proposals: readonly PlanProposal[];
  /**
   * Where "分析" sends a reader for a deeper conversation - never an inline
   * accept/reject (ADR-003: that only ever happens on the queue page). Both
   * buttons here are pointers, not writes.
   */
  readonly accountId: string;
}) {
  const { ACCOUNT_TEXT, BOARD_TEXT, PROPOSAL_TEXT } = useMessages();

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
      <Section
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
        <CapFooter>
          <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capPlanBasic}
          <br />
          <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capPlanPro}
        </CapFooter>
      </Section>
    );
  }

  // Grouped by the capability that produced them (ADR-015), so a reader can see
  // whether they are signing a relationship move or a commercial one before
  // they read the sentence.
  const groups = [...new Set(proposals.map((p) => p.group))];

  return (
    <Section
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
      <CapFooter>
        <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capPlanBasic}
        <br />
        <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capPlanPro}
      </CapFooter>
    </Section>
  );
}
