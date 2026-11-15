"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Button,
  Card,
  Icon,
  Textarea,
  useToast,
} from "@vxture/design-ui";
import type { AgentPanelData } from "../lib/board";
import { askHref, askOverBy, type AskAnchor } from "../lib/agent-ask";
import { captureFeedback } from "../lib/capture-feedback";
import { useMessages } from "../lib/i18n/provider";
import { FormAssistSlot, PageAssistantOutlet } from "./form-assist-slot";

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
  canAsk,
  askAnchor,
  onRecord,
  onAttach,
}: {
  readonly data: AgentPanelData;
  readonly canRecord: boolean;
  /** copilot.ask - without it the button is not offered at all, rather than
   *  shown dead. */
  readonly canAsk: boolean;
  /** What the panel is looking at, carried to the copilot page with the question. */
  readonly askAnchor?: AskAnchor;
  readonly onRecord?: (
    text: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onAttach?: () => void;
}) {
  const { BOARD_TEXT, FIELD_ERROR } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [pendingSave, start] = useTransition();
  // null when there is nothing to send, or too much of it to carry whole.
  const href = askHref(text, askAnchor);
  const over = askOverBy(text);

  // The shell owns the permanent assistant title and controls. This card
  // supplies only the current page's capture and conversation context.
  return (
    <>
    <PageAssistantOutlet>
    <Card className="min-h-64 flex-1 p-sm">
      <div className="flex h-full min-h-0 flex-col">
      <p className="mt-xs text-body-small tabular-nums text-muted-foreground">{BOARD_TEXT.agentScope(data.scanned)}</p>
      {canRecord || canAsk ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Textarea
            className="mt-sm min-h-24 flex-1 resize-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={BOARD_TEXT.capturePlaceholder}
            disabled={pendingSave}
          />
          {/* Guidance beside the field, never inside it: appended to the
                placeholder it rendered as a paragraph someone had already
                typed. */}
          <p className="text-muted-foreground mt-xs text-body-small leading-relaxed">
            {BOARD_TEXT.captureHelp}
          </p>
          {/* Said where the reader is looking, not only in a tooltip: the
              question is longer than the copilot page will take. */}
          {canAsk && over > 0 ? (
            <p className="text-warning mt-xs text-body-small leading-relaxed" role="status">
              {BOARD_TEXT.askTooLong(over)}
            </p>
          ) : null}

          {/* THE VERB IS THE BUTTON, not a mode set beforehand.
                A segmented control at the top made you declare what you were
                doing before you had written it; here you write first and then
                say what it is - which is the order the thought actually
                arrives in. */}
          <div className="mt-sm flex items-center gap-xs">
            {onAttach ? <Button
              variant="ghost"
              size="md"
              aria-label={BOARD_TEXT.attach}
              title={BOARD_TEXT.attach}
              disabled={pendingSave}
              onClick={() => onAttach?.()}
            >
              <Icon name="paperclip" size="xs" />
            </Button> : null}

            <div className="ml-auto flex items-center gap-xs">
              {/* 问参谋 takes the question to the copilot page (lib/agent-ask.ts).
                    Not offered to a member who cannot ask: a dead button on
                    every page was what stood here. */}
              {canAsk ? (
                <Button
                  variant="outline"
                  size="md"
                  disabled={pendingSave || href === null}
                  title={over > 0 ? BOARD_TEXT.askTooLong(over) : BOARD_TEXT.askHint}
                  onClick={() => {
                    if (!href) return;
                    router.push(href);
                    // The question now lives in the copilot page's own box. The
                    // deck persists across navigation, so leaving it here would
                    // show the same sentence twice - and one click on 记一笔 would
                    // file a QUESTION as a note.
                    setText("");
                  }}
                >
                  {BOARD_TEXT.ask}
                </Button>
              ) : null}
              {canRecord ? <Button
                size="md"
                disabled={pendingSave || text.trim() === "" || !onRecord}
                onClick={() =>
                  start(() => {
                    void onRecord?.(text).then((r) => {
                      // Said either way. A refused note stays in the box.
                      const f = captureFeedback(r, FIELD_ERROR, BOARD_TEXT.captured);
                      toast({ tone: f.tone, title: f.title });
                      if (f.clear) setText("");
                    });
                  })
                }
              >
                {BOARD_TEXT.capture}
              </Button> : null}
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </Card>
    </PageAssistantOutlet>
    {/* 智能填写 of the form on screen, if any (form-assist-slot.tsx). */}
    <FormAssistSlot />
    </>
  );
}
