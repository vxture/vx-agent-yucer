"use client";

import { useState, useTransition } from "react";
import { Button, Card, PanelItem, PanelList, Textarea } from "@vxture/design-ui";
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
  const [text, setText] = useState("");
  const [pendingSave, start] = useTransition();

  return (
    <div className="flex flex-col gap-sm">
      {canRecord ? (
        <Card className="p-sm">
          <p className="text-label-md text-foreground">{BOARD_TEXT.capture}</p>
          <Textarea
            className="mt-xs min-h-24 resize-none"
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
