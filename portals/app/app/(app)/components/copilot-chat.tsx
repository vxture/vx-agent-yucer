"use client";

import { useState, useTransition } from "react";
import {
  AIAssistantBubble,
  EmptyState,
  PageSection,
  PromptInput,
  StatusBadge,
} from "@vxture/design-system";
import { COPILOT_TEXT } from "../lib/messages";

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
  readonly onAsk: (
    question: string,
    sessionId: string | null,
  ) => Promise<
    { ok: true; sessionId: string; outcome: TurnOutcome } | { ok: false; error: string }
  >;
}

/** The model plane's error codes, translated into what the reader should do. */
function explainError(code: string): string {
  if (code === "atlas_ATLAS_NOT_CONFIGURED" || code === "no_active_tenant") {
    return COPILOT_TEXT.errorNotConfigured;
  }
  if (code === "atlas_GRANT_DENIED") return COPILOT_TEXT.errorNoGrant;
  if (code === "atlas_QUOTA_EXCEEDED") return COPILOT_TEXT.errorQuota;
  return COPILOT_TEXT.errorGeneric;
}

export function CopilotChat({ initialMessages, sessionId, canAsk, onAsk }: CopilotChatProps) {
  const [messages, setMessages] = useState<ChatMessageView[]>([...initialMessages]);
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
      void onAsk(question, session).then((result) => {
        if (!result.ok) {
          setError(explainError(result.error));
          return;
        }
        setSession(result.sessionId);
        setOutcome(result.outcome);
        setMessages((prev) => [...prev, { role: "assistant", content: result.outcome.answer }]);
      });
    });
  }

  return (
    <PageSection title={COPILOT_TEXT.title} description={COPILOT_TEXT.description}>
      {messages.length === 0 && !pending ? (
        <EmptyState title={COPILOT_TEXT.emptyTitle} description={COPILOT_TEXT.emptyDescription} />
      ) : (
        <div>
          {messages.map((m, i) => (
            <AIAssistantBubble key={i} role={m.role === "user" ? "user" : "ai"}>
              {m.content}
            </AIAssistantBubble>
          ))}
          {pending ? <AIAssistantBubble role="ai">{COPILOT_TEXT.thinking}</AIAssistantBubble> : null}
        </div>
      )}

      {error ? (
        <StatusBadge tone="danger">
          {COPILOT_TEXT.errorPrefix}
          {error}
        </StatusBadge>
      ) : null}

      {outcome && outcome.proposalCount > 0 ? (
        // A count and a pointer - never an inline accept. Approving a change
        // from inside a chat bubble is how the human step becomes a formality.
        <StatusBadge tone="warning">{COPILOT_TEXT.proposalsFromTurn(outcome.proposalCount)}</StatusBadge>
      ) : null}

      {outcome && outcome.droppedProposals > 0 ? (
        <StatusBadge tone="neutral">{COPILOT_TEXT.droppedProposals(outcome.droppedProposals)}</StatusBadge>
      ) : null}

      {outcome && outcome.capabilitiesUsed.length > 0 ? (
        <StatusBadge tone="info">
          {COPILOT_TEXT.capabilitiesUsed([...new Set(outcome.capabilitiesUsed)].join(", "))}
        </StatusBadge>
      ) : null}

      {outcome?.truncated ? <StatusBadge tone="warning">{COPILOT_TEXT.truncated}</StatusBadge> : null}

      <PromptInput
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        placeholder={COPILOT_TEXT.placeholder}
        submitLabel={COPILOT_TEXT.submit}
        busy={pending}
        // A member without copilot.use gets a disabled input rather than a
        // hidden one: knowing the assistant exists is not a leak, and silently
        // omitting it reads as a broken page.
        hint={canAsk ? undefined : COPILOT_TEXT.errorGeneric}
      />
    </PageSection>
  );
}
