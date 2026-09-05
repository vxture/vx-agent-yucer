"use client";

import Link from "next/link";

import {
  Button,
  Card,
  PanelItem,
  PanelList,
} from "@vxture/design-ui";
import { AgentCapture } from "./agent-capture";
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

  return (
    <div className="flex flex-col gap-sm">
      <AgentCapture
        data={data}
        canRecord={canRecord}
        onRecord={onRecord}
        onAsk={onAsk}
        onAttach={onAttach}
      />

      {data.pending.length > 0 ? (
        <Card className="p-sm">
          <p className="text-label-md text-foreground">
            {BOARD_TEXT.pendingTitle}
          </p>
          <PanelList className="mt-xs">
            {data.pending.map((p) => (
              <PanelItem
                key={p.id}
                main={
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body-sm">{p.title}</span>
                    <span className="text-muted-foreground truncate text-body-sm">
                      {p.why}
                    </span>
                  </span>
                }
                trail={
                  <span className="text-muted-foreground text-body-sm">
                    {p.source}
                  </span>
                }
              />
            ))}
          </PanelList>
        </Card>
      ) : null}

      {/* THE ENEMY, and the honest state of it.
          There is no structured competitor data in this product - competitors
          appear only inside raw follow-up notes. So this card reports "not
          scouted" and offers the analysis that would change that. A war room
          that invents its enemies is worse than one that admits it cannot see
          them, and the empty state is what gives the competition analysis a
          reason to exist. */}
      <Card className="p-sm">
        <p className="text-label-md text-foreground">{BOARD_TEXT.reconTitle}</p>
        <p className="text-muted-foreground mt-xs text-body-sm leading-relaxed">
          {BOARD_TEXT.reconEmpty}
        </p>
        <Button size="sm" variant="outline" className="mt-sm w-full" disabled>
          {BOARD_TEXT.reconCta}
        </Button>
        <p className="text-muted-foreground mt-xs text-body-sm">
          {BOARD_TEXT.analysisNote}
        </p>
      </Card>

      {data.recent.length > 0 ? (
        <Card className="p-sm">
          <p className="text-label-md text-foreground">
            {BOARD_TEXT.recentTitle}
          </p>
          <PanelList className="mt-xs">
            {data.recent.map((r) => (
              <PanelItem
                key={r.id}
                main={
                  <span className="text-muted-foreground text-body-sm">
                    {r.text}
                  </span>
                }
                trail={
                  <span className="text-muted-foreground text-body-sm">
                    {r.when}
                  </span>
                }
              />
            ))}
          </PanelList>
        </Card>
      ) : null}
    </div>
  );
}
