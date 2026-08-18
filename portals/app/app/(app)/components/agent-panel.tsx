"use client";

import { useState, useTransition } from "react";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  PanelItem,
  PanelList,
  SegmentedControl,
  Textarea,
} from "@vxture/design-ui";
import { BOARD_TEXT } from "../lib/messages";
import type { AgentPanelData } from "../lib/board";

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
  readonly onRecord?: (text: string) => Promise<{ ok: boolean; error?: string }>;
}

export function AgentPanel({ data, canRecord, onRecord }: AgentPanelProps) {
  const [mode, setMode] = useState<"note" | "ask">("note");
  const [text, setText] = useState("");
  const [pendingSave, start] = useTransition();

  return (
    <div className="flex flex-col gap-sm">
      {/* The agent says what it is currently looking at. The quality of every
          answer below depends on that scope, and a reader should not have to
          guess it. */}
      <Card className="p-sm">
        <div className="flex items-center gap-xs">
          <Avatar className="size-6">
            <AvatarFallback>{BOARD_TEXT.agent.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="text-label-md text-foreground">{BOARD_TEXT.agent}</span>
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {BOARD_TEXT.agentScope(data.scanned)}
          </span>
        </div>
      </Card>

      {canRecord ? (
        <Card className="p-sm">
          <SegmentedControl
            ariaLabel={BOARD_TEXT.capture}
            fill
            value={mode}
            onChange={(v: "note" | "ask") => setMode(v)}
            items={[
              { value: "note", label: BOARD_TEXT.capture },
              { value: "ask", label: BOARD_TEXT.ask },
            ]}
          />
          <Textarea
            className="mt-sm min-h-24 resize-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={BOARD_TEXT.capturePlaceholder}
            disabled={pendingSave}
          />
          {/* Guidance beside the field, never inside it: appended to the
              placeholder it rendered as a paragraph someone had already
              typed. */}
          <p className="text-muted-foreground mt-xs text-xs leading-relaxed">
            {BOARD_TEXT.captureHelp}
          </p>
          <div className="mt-xs flex justify-end">
            <Button
              size="sm"
              disabled={pendingSave || text.trim() === "" || !onRecord}
              onClick={() =>
                start(() => {
                  void onRecord?.(text).then((r) => {
                    if (r.ok) setText("");
                  });
                })
              }
            >
              {BOARD_TEXT.captureSend}
            </Button>
          </div>
        </Card>
      ) : null}

      {data.pending.length > 0 ? (
        <Card className="p-sm">
          <p className="text-label-md text-foreground">{BOARD_TEXT.pendingTitle}</p>
          <PanelList className="mt-xs">
            {data.pending.map((p) => (
              <PanelItem
                key={p.id}
                main={<span className="truncate text-body-sm">{p.title}</span>}
                trail={<span className="text-muted-foreground text-xs">{p.source}</span>}
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
        <p className="text-muted-foreground mt-xs text-xs leading-relaxed">
          {BOARD_TEXT.reconEmpty}
        </p>
        <Button size="sm" variant="outline" className="mt-sm w-full" disabled>
          {BOARD_TEXT.reconCta}
        </Button>
        <p className="text-muted-foreground mt-xs text-xs">{BOARD_TEXT.reconNote}</p>
      </Card>

      {data.recent.length > 0 ? (
        <Card className="p-sm">
          <p className="text-label-md text-foreground">{BOARD_TEXT.recentTitle}</p>
          <PanelList className="mt-xs">
            {data.recent.map((r) => (
              <PanelItem
                key={r.id}
                main={<span className="text-muted-foreground text-body-sm">{r.text}</span>}
                trail={<span className="text-muted-foreground text-xs">{r.when}</span>}
              />
            ))}
          </PanelList>
        </Card>
      ) : null}
    </div>
  );
}
