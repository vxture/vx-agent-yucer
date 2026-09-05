"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  Icon,
  Textarea,
} from "@vxture/design-ui";
import type { AgentPanelData } from "../lib/board";
import { useMessages } from "../lib/i18n/provider";

// The assistant's own card: who is looking, at how much, the way into the
// full thread, and the box you type into.
//
// EXTRACTED FROM AgentPanel on 2026-09-05, when the price book was told to
// keep the conversation at the top of its dock and drop the rest (the
// workspace-wide queues answer questions that page is not asking). A dock
// that varies by page needs this piece on its own; nothing about it changed
// in the move.

export function AgentCapture({
  data,
  canRecord,
  onRecord,
  onAsk,
  onAttach,
}: {
  readonly data: AgentPanelData;
  readonly canRecord: boolean;
  readonly onRecord?: (
    text: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onAsk?: (text: string) => void;
  readonly onAttach?: () => void;
}) {
  const { BOARD_TEXT } = useMessages();
  const [text, setText] = useState("");
  const [pendingSave, start] = useTransition();

  // ONE card, with the agent's identity as its header. Splitting the identity
  // into its own card made the panel read as two unrelated things stacked; the
  // scope line belongs to the box you are about to type into, because it says
  // what the answer will be based on.
  return (
    <Card className="p-sm">
      <div className="flex items-center gap-xs">
        <Avatar className="size-6">
          <AvatarFallback>{BOARD_TEXT.agent.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <span className="text-label-md text-foreground">
          {BOARD_TEXT.agent}
        </span>
        <span className="text-muted-foreground ml-auto text-body-sm tabular-nums">
          {BOARD_TEXT.agentScope(data.scanned)}
        </span>

        {/* THE WAY INTO THE FULL CONVERSATION, and the only one.

              The copilot has no entry in the domain launcher on purpose - it
              is not a place you go, it is the thing that reads the record and
              puts what it wants decided in front of you. But the full thread
              is a real page, and with the menu entry gone this is where it has
              to be reachable from: beside the assistant you are already
              talking to, not in a list of business domains it does not belong
              to. Without this the page is orphaned, which is what
              functional-domains.test.ts asserts against. */}
        <Button asChild variant="ghost" size="sm" className="-mr-xs">
          <Link href="/copilot" aria-label={BOARD_TEXT.openThread}>
            <Icon name="chat-circle" size="xs" />
          </Link>
        </Button>
      </div>

      {canRecord ? (
        <>
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
          <p className="text-muted-foreground mt-xs text-body-sm leading-relaxed">
            {BOARD_TEXT.captureHelp}
          </p>

          {/* THE VERB IS THE BUTTON, not a mode set beforehand.
                A segmented control at the top made you declare what you were
                doing before you had written it; here you write first and then
                say what it is - which is the order the thought actually
                arrives in. */}
          <div className="mt-sm flex items-center gap-xs">
            <Button
              variant="ghost"
              size="sm"
              aria-label={BOARD_TEXT.attach}
              title={onAttach ? BOARD_TEXT.attach : BOARD_TEXT.notWired}
              disabled={!onAttach || pendingSave}
              onClick={() => onAttach?.()}
            >
              <Icon name="paperclip" size="xs" />
            </Button>

            <div className="ml-auto flex items-center gap-xs">
              {/* Disabled until the ask path is wired to the agent plane.
                    A button that silently does nothing teaches people the
                    product is broken; one that is visibly not ready does not. */}
              <Button
                variant="outline"
                size="sm"
                disabled={!onAsk || pendingSave || text.trim() === ""}
                title={onAsk ? undefined : BOARD_TEXT.notWired}
                onClick={() => onAsk?.(text)}
              >
                {BOARD_TEXT.ask}
              </Button>
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
                {BOARD_TEXT.capture}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}
