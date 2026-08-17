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
import { HOME_TEXT } from "../lib/messages";

// The agent, as a column rather than a page.
//
// It used to be the ninth item in the nav, which said it was optional - one
// more feature you might click. It is the product. So it sits beside the work
// permanently, and it says what it is currently looking at, because the quality
// of any answer depends on that and a reader should not have to guess.
//
// The capture box lives here for a different reason: it belongs to no single
// judgement. At the bottom of a page it reads as that page's form; here it is
// what it actually is - the way anything gets into the system at all.

export interface PendingItem {
  readonly id: string;
  readonly title: string;
  readonly source: "rule" | "model";
  readonly when: string;
}

export interface AgentColumnProps {
  readonly scanned: number;
  readonly pending: readonly PendingItem[];
  readonly recent: readonly { id: string; text: string; when: string }[];
  readonly canRecord: boolean;
  readonly onRecord?: (text: string) => Promise<{ ok: boolean; error?: string }>;
}

export function AgentColumn({ scanned, pending, recent, canRecord, onRecord }: AgentColumnProps) {
  const [mode, setMode] = useState<"note" | "ask">("note");
  const [text, setText] = useState("");
  const [pendingSave, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Avatar className="size-7">
          <AvatarFallback>{HOME_TEXT.agentAvatar}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-sm font-bold">{HOME_TEXT.agentTitle}</div>
          {/* Said out loud. An answer's worth depends on what it read. */}
          <div className="text-muted-foreground text-xs">{HOME_TEXT.agentScope(scanned)}</div>
        </div>
      </div>

      {canRecord ? (
        <Card className="p-sm">
          <SegmentedControl
            ariaLabel={HOME_TEXT.agentComposeLabel}
            fill
            value={mode}
            onChange={(v: "note" | "ask") => setMode(v)}
            items={[
              { value: "note", label: HOME_TEXT.agentNote },
              { value: "ask", label: HOME_TEXT.agentAsk },
            ]}
          />
          {/* The DS Textarea keeps its own border and padding. An earlier
              version stripped all three to fake an inline composer, which is
              restyling the design system rather than using it. */}
          <Textarea
            className="mt-sm min-h-20 resize-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={HOME_TEXT.agentPlaceholder}
            disabled={pendingSave}
          />
          <p className="text-muted-foreground mt-xs text-xs leading-relaxed">
            {HOME_TEXT.agentHelp}
          </p>
          <div className="mt-sm flex justify-end">
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
              {HOME_TEXT.agentSend}
            </Button>
          </div>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <section>
          <h3 className="text-muted-foreground mb-1.5 text-xs font-bold tracking-wide uppercase">
            {HOME_TEXT.agentPendingCount(pending.length)}
          </h3>
          <PanelList>
            {pending.map((p) => (
              <PanelItem
                key={p.id}
                main={<span className="text-sm font-medium">{p.title}</span>}
                trail={
                  // Marked here too: a decision queue must let a person see
                  // whether a row was counted out by a rule or thought up by a
                  // model before they sign it.
                  <span className="text-muted-foreground text-xs">
                    {HOME_TEXT.agentPendingWhen(
                      p.source === "rule" ? HOME_TEXT.sourceRule : HOME_TEXT.sourceModel,
                      p.when,
                    )}
                  </span>
                }
              />
            ))}
          </PanelList>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section>
          <h3 className="text-muted-foreground mb-1.5 text-xs font-bold tracking-wide uppercase">
            {HOME_TEXT.agentRecent}
          </h3>
          <PanelList>
            {recent.map((r) => (
              <PanelItem
                key={r.id}
                main={<span className="text-muted-foreground text-sm">{r.text}</span>}
                trail={<span className="text-muted-foreground text-xs">{r.when}</span>}
              />
            ))}
          </PanelList>
        </section>
      ) : null}
    </div>
  );
}
