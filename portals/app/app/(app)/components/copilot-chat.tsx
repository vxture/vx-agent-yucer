"use client";

import { Section } from "./help-section";
import Link from "next/link";
import type { EvidenceCitation } from "../../domains/copilot/lib/citations";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, Card, Icon, StatusBadge } from "@vxture/design-ui";

import { useMessages } from "../lib/i18n/provider";
import type { Dictionary } from "../lib/i18n/dictionary";
import { explainModelPlaneError } from "../lib/model-plane-error";
import { Tag } from "./tag";
import { AssistantComposer, AssistantMessage, AssistantTranscript } from "./assistant-conversation";
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
  id?: string;
  citations?: EvidenceCitation[];
}

export interface TurnOutcome {
  answer: string;
  citations?: EvidenceCitation[];
  proposalCount: number;
  droppedProposals: number;
  capabilitiesUsed: string[];
  truncated: boolean;
}

export interface CopilotChatProps {
  readonly embedded?: boolean;
  readonly onRecord?: (text: string) => Promise<{ ok: boolean; error?: string }>;
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
  /**
   * A question another page composed and sent the person here with - the war
   * room's 「分析这一单」. PREFILLED, NEVER AUTO-SENT: a model turn spends the
   * workspace's quota and records proposals, and the person pressing send is
   * what makes that theirs. They can edit it first, which is the point.
   */
  readonly initialDraft?: string;
  /** 对话锚定本单 (deal batch 11b): the deal this conversation is about. */
  readonly deal?: { id: string; name: string };
  /** 预演 (deal batch 11c): role-play on that deal - labelled, proposes nothing. */
  readonly rehearsal?: boolean;
  readonly onAsk: (
    question: string,
    sessionId: string | null,
    accountId?: string,
    anchor?: { opportunityId?: string; rehearsal?: boolean; retryMessageId?: string },
  ) => Promise<
    | { ok: true; sessionId: string; outcome: TurnOutcome }
    | { ok: false; error: string; recovery?: { sessionId: string; messageId: string } }
  >;
}

export function CopilotChat({
  embedded = false,
  onRecord,
  initialMessages,
  sessionId,
  canAsk,
  account,
  initialDraft,
  deal,
  rehearsal = false,
  onAsk,
}: CopilotChatProps) {
  const router = useRouter();
  const { ASK_ABOUT_TEXT, COPILOT_TEXT, ASSISTANT_PANEL_TEXT: P, FIELD_ERROR, BOARD_TEXT } = useMessages();
  const [messages, setMessages] = useState<ChatMessageView[]>([
    ...initialMessages,
  ]);
  const [session, setSession] = useState<string | null>(sessionId);
  const unfinished = initialMessages.at(-1);
  const [draft, setDraft] = useState(initialDraft ?? (unfinished?.role === "user" ? unfinished.content : ""));
  const [outcome, setOutcome] = useState<TurnOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recovery = useRef<{ question: string; messageId: string } | null>(unfinished?.role === "user" && unfinished.id ? { question: unfinished.content, messageId: unfinished.id } : null);
  const inFlight = useRef(false);
  const [pending, startTransition] = useTransition();

  function submit(value: string) {
    const question = value.trim();
    if (!question || inFlight.current || !canAsk) return;
    inFlight.current = true;

    // The question is shown immediately. It is also persisted server-side before
    // the model is called, so what the user sees here and what survives a
    // model-plane failure are the same thing.
    const alreadyShown = messages.at(-1)?.role === "user" && messages.at(-1)?.content === question;
    if (!alreadyShown) setMessages((prev) => [...prev, { role: "user", content: question }]);
    setDraft("");
    setError(null);
    setOutcome(null);

    startTransition(async () => {
      try {
        const result = await onAsk(question, session, account?.id, { opportunityId: deal?.id, rehearsal, retryMessageId: recovery.current?.question === question ? recovery.current.messageId : undefined });
        if (!result.ok) {
          if (result.recovery) {
            setSession(result.recovery.sessionId);
            recovery.current = { question, messageId: result.recovery.messageId };
          }
          setError(explainModelPlaneError(result.error, COPILOT_TEXT));
          setDraft(question);
          return;
        }
        recovery.current = null;
        setSession(result.sessionId);
        setOutcome(result.outcome);
        router.refresh();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.outcome.answer, citations: result.outcome.citations },
        ]);
      } catch {
        setError(COPILOT_TEXT.errorGeneric);
        setDraft(question);
      } finally {
        inFlight.current = false;
      }
    });
  }

  const conversation = <div className={embedded ? "flex h-full min-h-0 flex-1 flex-col gap-md" : "flex h-[40rem] max-h-[80dvh] min-h-0 flex-col gap-md"}>
    {!embedded && (deal || account) ? <StatusBadge tone={rehearsal ? "warning" : "info"} dot>
      {deal ? rehearsal ? ASK_ABOUT_TEXT.rehearsal(deal.name) : ASK_ABOUT_TEXT.anchoredDeal(deal.name) : ASK_ABOUT_TEXT.anchored(account!.name)}
    </StatusBadge> : null}
    <div className="flex shrink-0 justify-end">
      <Button type="button" variant="ghost" size="md" disabled={pending} onClick={() => {
        recovery.current = null; setSession(null); setMessages([]); setOutcome(null); setError(null);
      }}>{COPILOT_TEXT.newSession}</Button>
    </div>
    <AssistantTranscript revision={messages.length} busy={pending}>
      {messages.map((message, index) => <AssistantMessage key={message.id ?? index} role={message.role}>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {message.citations?.length ? <div className="mt-sm flex flex-wrap gap-xs">{message.citations.map(citation => <Button key={citation.id} variant="outline" size="md" asChild><Link href={citation.href}>{citation.label}</Link></Button>)}</div> : null}
      </AssistantMessage>)}
      {pending ? <p role="status" className="flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="spinner" size="sm" className="animate-spin" />{COPILOT_TEXT.thinking}</p> : null}
      {error ? <Card className="p-md" data-assistant-failure>
        <p role="alert" className="text-body-small text-destructive-text">{error}</p>
        <Button type="button" size="md" variant="outline" disabled={pending || !draft.trim()} onClick={() => submit(draft)}>{COPILOT_TEXT.submit}</Button>
      </Card> : null}
      {outcome && outcome.proposalCount > 0 ? <Card className="p-md"><Button asChild size="md" variant="outline">
        <Link href="/copilot?view=proposals#copilot-proposals">{COPILOT_TEXT.proposalsFromTurn(outcome.proposalCount)}</Link>
      </Button></Card> : null}
      {outcome && outcome.droppedProposals > 0 ? <Tag>{COPILOT_TEXT.droppedProposals(outcome.droppedProposals)}</Tag> : null}
      {outcome?.truncated ? <StatusBadge tone="warning">{COPILOT_TEXT.truncated}</StatusBadge> : null}
      {messages.length === 0 && !rehearsal ? <div className="flex flex-wrap gap-xs">
        {COPILOT_TEXT.starters.map(question => <Button key={question} variant="outline" size="md" disabled={!canAsk || pending} onClick={() => setDraft(question)}>{question}</Button>)}
      </div> : null}
    </AssistantTranscript>
    <AssistantComposer value={draft} onChange={setDraft} onSend={() => submit(draft)} disabled={!canAsk && !onRecord} sendDisabled={!canAsk} busy={pending}
      placeholder={COPILOT_TEXT.placeholder} extra={onRecord ? <Button type="button" size="md" variant="ghost"
        disabled={pending || !draft.trim()} onClick={() => {
          const note = draft.trim();
          if (!note || inFlight.current) return;
          inFlight.current = true;
          startTransition(async () => {
            try {
              const result = await onRecord(note);
              if (result.ok) { setDraft(""); setMessages(previous => [...previous, { role: "user", content: note }, { role: "assistant", content: BOARD_TEXT.captured }]); router.refresh(); }
              else setError(FIELD_ERROR[result.error ?? "denied"] ?? FIELD_ERROR.denied);
            } catch { setError(COPILOT_TEXT.errorGeneric); }
            finally { inFlight.current = false; }
          });
        }}>{P.recordNote}</Button> : null} />
  </div>;
  return embedded ? conversation : <Section title={COPILOT_TEXT.title} help={COPILOT_TEXT.description}>{conversation}</Section>;
}
