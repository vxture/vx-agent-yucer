"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@vxture/design-ui";
import { AgentCapture } from "./agent-capture";
import { AssistantDeck } from "./assistant";
import type { AgentPanelData } from "../lib/board";
import { MeetingBriefButton, type MeetingBriefButtonProps } from "./meeting-brief";

import { useMessages } from "../lib/i18n/provider";
// The right-hand operation panel.
//
// Capture went to a bar along the bottom for one round and that was wrong: a
// bar under the content reads as THAT PAGE'S form, and the whole point of this
// box is that it belongs to no page - a note is worth keeping whatever you were
// looking at. On the right it is what it actually is, an always-available way
// to put something into the system.
//
// The lists under it are not a feed - each one answers a question worth
// glancing at, not a scroll of everything that happened.
//
// "最近记的" (recent notes) is GONE (owner, 2026-09-21: 继续梳理智能助手板块
// - 最近记的和跟进记录 tab 重复, 去掉, 只保留详细 tab 那一份) - it queried
// the same listInteractions() the account page's own 跟进记录 tab already
// shows in full; this panel's copy was the same three rows, truncated to 40
// characters, with no way to see more. One place to read what was recorded,
// not two disagreeing on how much of it to show.

export interface AgentPanelProps {
  readonly data: AgentPanelData;
  readonly canRecord: boolean;
  readonly onRecord?: (
    text: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Absent until the ask path reaches the agent plane; the button says so. */
  readonly onAsk?: (text: string) => void;
  /** Absent until attachment intake exists; same treatment. */
  readonly onAttach?: () => void;
  /**
   * 会前准备 (L6 batch five) - only on an account's deck, and only when the
   * reader holds copilot.suggest. Absent means the section is not shown.
   */
  readonly briefFor?: { accountId: string; contacts: MeetingBriefButtonProps["contacts"] };
  readonly onBuildBrief?: MeetingBriefButtonProps["onBuild"];
  /**
   * 本单参谋 (deal batch 2c, YC-069): the section of the deck that follows the
   * page, placed right under the capture box. Built by the page's own deck
   * route as its own component, so the action it binds pairs with its own
   * error dictionary. Absent on every other page.
   */
  readonly advisor?: ReactNode;
}

export function AgentPanel({
  data,
  canRecord,
  onRecord,
  onAsk,
  onAttach,
  briefFor,
  onBuildBrief,
  advisor,
}: AgentPanelProps) {
  const { BOARD_TEXT } = useMessages();

  const sections = [
    // A quick command, first because it is the one you open the deck for
    // half an hour before a meeting.
    ...(briefFor && onBuildBrief
      ? [
          {
            id: "meeting",
            title: BOARD_TEXT.meetingTitle,
            empty: BOARD_TEXT.meetingHint,
            items: [],
            footer: (
              <MeetingBriefButton accountId={briefFor.accountId} contacts={briefFor.contacts} onBuild={onBuildBrief} />
            ),
          },
        ]
      : []),
    {
      id: "pending",
      title: BOARD_TEXT.pendingTitle,
      empty: BOARD_TEXT.pendingEmpty,
      items: data.pending.map((p) => ({
        id: p.id,
        text: p.title,
        evidence: p.why,
        trail: p.source,
        // A proposal is decided in the copilot's own thread, where the whole
        // payload is visible - not from a one-line summary.
        link: { label: BOARD_TEXT.openThread, href: "/copilot" },
      })),
    },
    {
      id: "recon",
      title: BOARD_TEXT.reconTitle,
      // THE ENEMY, and the honest state of it: there is no structured
      // competitor data in this product - competitors appear only inside raw
      // follow-up notes. A war room that invents its enemies is worse than
      // one that admits it cannot see them.
      empty: BOARD_TEXT.reconEmpty,
      items: [],
      footer: (
        <span className="flex flex-col gap-xs">
          <Button size="sm" variant="outline" disabled>
            {BOARD_TEXT.reconCta}
          </Button>
          <span className="text-muted-foreground text-body-sm">{BOARD_TEXT.analysisNote}</span>
        </span>
      ),
    },
  ];

  return (
    <AssistantDeck
      capture={
        <>
          <AgentCapture
            data={data}
            canRecord={canRecord}
            onRecord={onRecord}
            onAsk={onAsk}
            onAttach={onAttach}
          />
          {advisor}
        </>
      }
      sections={sections}
    />
  );
}
