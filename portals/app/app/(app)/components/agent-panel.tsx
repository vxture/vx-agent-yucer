"use client";

import Link from "next/link";

import { Button } from "@vxture/design-ui";
import { AgentCapture } from "./agent-capture";
import { AssistantDeck } from "./assistant";
import type { AgentPanelData } from "../lib/board";

import { useMessages } from "../lib/i18n/provider";
// The right-hand operation panel.
//
// Capture went to a bar along the bottom for one round and that was wrong: a
// bar under the content reads as THAT PAGE'S form, and the whole point of this
// box is that it belongs to no page - a note is worth keeping whatever you were
// looking at. On the right it is what it actually is, an always-available way
// to put something into the system.
//
// The two lists under it are not a feed. They answer the only two questions
// that make the panel worth glancing at: what has the agent put in front of me,
// and did the last thing I wrote actually land.

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
}

export function AgentPanel({
  data,
  canRecord,
  onRecord,
  onAsk,
  onAttach,
}: AgentPanelProps) {
  const { BOARD_TEXT } = useMessages();

  // THE SAME SURFACE EVERY PAGE'S DOCK USES (2026-09-05). These three blocks
  // were three hand-rolled cards; as sections they gain the assistant's
  // grammar for free and, more to the point, stop drifting from the pages
  // that answer their own questions in the same place.
  const sections = [
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
    {
      id: "recent",
      title: BOARD_TEXT.recentTitle,
      empty: BOARD_TEXT.recentEmpty,
      // A record of what happened is not a suggestion: nothing to accept, and
      // nothing to dismiss.
      items: data.recent.map((r) => ({
        id: r.id,
        text: r.text,
        trail: r.when,
        ignorable: false,
      })),
    },
  ];

  return (
    <AssistantDeck
      capture={
        <AgentCapture
          data={data}
          canRecord={canRecord}
          onRecord={onRecord}
          onAsk={onAsk}
          onAttach={onAttach}
        />
      }
      sections={sections}
    />
  );
}
