"use client";

import { AssistantSection } from "./assistant";
import { useMessages } from "../lib/i18n/provider";
import type { Decision } from "../../domains/copilot/lib/action";

// 栏3 · 本单参谋 (deal batch 2c, YC-069): the part of the deck that follows the
// page. On a deal it carries that deal's proposals, decided in place - they
// left 态势判决 so each fact lives in one place. In the assistant's one
// grammar (assistant.tsx): the proposal, its rationale, one authorised act.
// The brief (局势简报) joins this section when runAdvisor generates it.

/** One proposal on the deal the deck is beside, already labelled. */
export interface DeckProposal {
  readonly id: string;
  readonly title: string;
  readonly rationale: string | null;
  readonly group: string;
  readonly confidence: number | null;
  /** The per-row gate (YC-042): may THIS member decide it. */
  readonly decidable: boolean;
}

export function DealAdvisor({
  scope,
  proposals,
  onAdjudicate,
}: {
  readonly scope: string;
  readonly proposals: readonly DeckProposal[];
  readonly onAdjudicate: (
    ids: string[],
    decision: Decision,
  ) => Promise<{
    ok: boolean;
    decided: string[];
    skipped: Array<{ id: string; reason: string }>;
    failed: Array<{ id: string; reason: string }>;
    error?: string;
  }>;
}) {
  const { DEAL_PAGE_TEXT, WAR_ROOM_TEXT, PROPOSAL_ERROR } = useMessages();

  // Accepting EXECUTES (the queue's own action), so the verb says so. A row
  // that was skipped or failed reports why, in the queue's dictionary.
  const accept = (id: string) => async (): Promise<{ ok: boolean; error?: string }> => {
    const r = await onAdjudicate([id], "accept");
    if (r.decided.includes(id) && !r.failed.some((f) => f.id === id)) return { ok: true };
    return {
      ok: false,
      error: r.failed.find((f) => f.id === id)?.reason ?? r.skipped.find((f) => f.id === id)?.reason ?? r.error ?? "not_found",
    };
  };

  return (
    <AssistantSection
      section={{
        id: "deal-advisor",
        title: DEAL_PAGE_TEXT.advisorTitle,
        scope,
        empty: DEAL_PAGE_TEXT.advisorEmpty,
        items: proposals.map((p) => ({
          id: p.id,
          text: p.title,
          evidence: p.rationale ?? undefined,
          trail: DEAL_PAGE_TEXT.advisorTrail(p.group, p.confidence),
          act: p.decidable
            ? { label: WAR_ROOM_TEXT.acceptAndExecute, run: accept(p.id), done: WAR_ROOM_TEXT.accepted, errors: PROPOSAL_ERROR }
            : undefined,
          // Rejecting takes a reason, and the queue is where one is given.
          link: { label: WAR_ROOM_TEXT.toQueue, href: "/copilot" },
        })),
      }}
    />
  );
}
