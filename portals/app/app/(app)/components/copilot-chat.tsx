"use client";

import { useState, useTransition } from "react";
import { Button, Section, StatusBadge, Textarea } from "@vxture/design-ui";

import { useMessages } from "../lib/i18n/provider";
import type { Dictionary } from "../lib/i18n/dictionary";
import { explainModelPlaneError } from "../lib/model-plane-error";
// The copilot conversation.
//
// The design decision that matters here is what the surface REFUSES to imply.
// The copilot proposes; a human decides. So this component:
//
//   - renders proposals as a COUNT and a pointer to the queue, never as
//     something you can accept inline. Approving a change from inside a chat
//     bubble, mid-conversation, is exactly the frictionless path that turns the
//     human step into a rubber stamp;
//   - reports proposals that were DROPPED because the tier does not include
//     copilot.suggest, instead of quietly showing fewer;
//   - surfaces the model plane's own failure reason rather than a generic
//     apology, because "not yet provisioned" and "quota exhausted" need
//     completely different responses from whoever is reading.

export interface ChatMessageView {
  role: "user" | "assistant";
  content: string;
}

export interface TurnOutcome {
  answer: string;
  proposalCount: number;
  droppedProposals: number;
  capabilitiesUsed: string[];
  truncated: boolean;
}

export interface CopilotChatProps {
  readonly initialMessages: readonly ChatMessageView[];
  readonly sessionId: string | null;
  readonly canAsk: boolean;
  /**
   * The account this conversation is anchored to, when it is anchored.
   *
   * Only the id and the name travel. Everything the model is told about the
   * account is re-read on the server behind account.view.
   */
  readonly account?: { id: string; name: string };
  readonly onAsk: (
    question: string,
    sessionId: string | null,
    accountId?: string,
  ) => Promise<
    | { ok: true; sessionId: string; outcome: TurnOutcome }
    | { ok: false; error: string }
  >;
}

export function CopilotChat({
  initialMessages,
  sessionId,
  canAsk,
  account,
  onAsk,
}: CopilotChatProps) {
  const { ASK_ABOUT_TEXT, COPILOT_TEXT } = useMessages();
  const [messages, setMessages] = useState<ChatMessageView[]>([
    ...initialMessages,
  ]);
  const [session, setSession] = useState<string | null>(sessionId);
  const [draft, setDraft] = useState("");
  const [outcome, setOutcome] = useState<TurnOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(value: string) {
    const question = value.trim();
    if (!question || pending) return;

    // The question is shown immediately. It is also persisted server-side before
    // the model is called, so what the user sees here and what survives a
    // model-plane failure are the same thing.
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setDraft("");
    setError(null);
    setOutcome(null);

    startTransition(() => {
      void onAsk(question, session, account?.id).then((result) => {
        if (!result.ok) {
          setError(explainModelPlaneError(result.error, COPILOT_TEXT));
          return;
        }
        setSession(result.sessionId);
        setOutcome(result.outcome);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.outcome.answer },
        ]);
      });
    });
  }

  return (
    <Section title={COPILOT_TEXT.title} description={COPILOT_TEXT.description}>
      {/* Said out loud, because the difference between a grounded answer and a
          general one is the difference between citing and guessing - and a
          reader who cannot tell which they are getting will trust both alike. */}
      {account ? (
        <>
          <StatusBadge tone="info" dot>
            {ASK_ABOUT_TEXT.anchored(account.name)}
          </StatusBadge>
          <p>{ASK_ABOUT_TEXT.anchoredHint}</p>
        </>
      ) : null}

      {/* NO EMPTY STATE, and this is a deliberate subtraction. An EmptyState
          announces an absence, which is worth 146px when a reader might
          otherwise wonder whether something failed to load. Here the control
          that fills the absence is directly underneath, and the same screen
          already explained itself twice: the section's own description says
          what the assistant does, and the composer's placeholder shows a
          question to ask. A third block saying "no conversation yet" above the
          box for starting one cost 146px of the 403 this section spent while
          empty - and the proposals, which are the page's actual work, started
          at y=740 in a 900px viewport because of it.

          The composer IS the empty state. */}
      {messages.length > 0 || pending ? (
        <div>
          {messages.map((m, i) => (
            <div key={i} data-role={m.role}>
              {m.content}
            </div>
          ))}
          {pending ? (
            <div data-role="assistant">{COPILOT_TEXT.thinking}</div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <StatusBadge tone="danger">
          {COPILOT_TEXT.errorPrefix}
          {error}
        </StatusBadge>
      ) : null}

      {outcome && outcome.proposalCount > 0 ? (
        // A count and a pointer - never an inline accept. Approving a change
        // from inside a chat bubble is how the human step becomes a formality.
        <StatusBadge tone="warning">
          {COPILOT_TEXT.proposalsFromTurn(outcome.proposalCount)}
        </StatusBadge>
      ) : null}

      {outcome && outcome.droppedProposals > 0 ? (
        <StatusBadge tone="neutral">
          {COPILOT_TEXT.droppedProposals(outcome.droppedProposals)}
        </StatusBadge>
      ) : null}

      {outcome && outcome.capabilitiesUsed.length > 0 ? (
        <StatusBadge tone="info">
          {COPILOT_TEXT.capabilitiesUsed(
            [...new Set(outcome.capabilitiesUsed)].join(", "),
          )}
        </StatusBadge>
      ) : null}

      {outcome?.truncated ? (
        <StatusBadge tone="warning">{COPILOT_TEXT.truncated}</StatusBadge>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={COPILOT_TEXT.placeholder}
          disabled={!canAsk || pending}
          rows={3}
          aria-label={COPILOT_TEXT.placeholder}
        />
        <Button
          type="submit"
          disabled={!canAsk || pending || draft.trim() === ""}
        >
          {COPILOT_TEXT.submit}
        </Button>
        {!canAsk ? <p>{COPILOT_TEXT.errorGeneric}</p> : null}
      </form>
    </Section>
  );
}
