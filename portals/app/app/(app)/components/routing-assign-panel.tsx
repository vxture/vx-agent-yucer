"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button, Card, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { ROUTING_ANALYSE_EVENT } from "../lib/routing-signal";
import type { AssignmentProposal } from "../lead/assign-actions";
import type { RoutingAdvice } from "../../domains/signal/lib/routing-advice";

// 智能分配 - the routing module's analysis, on demand, in the assistant
// (owner, 2026-09-06: 提供分配建议并提供采纳/重新分析/放弃等操作；分析结果在
// 智能助手面板).
//
// THE PAGE IS A LIST; THIS IS THE THINKING. An earlier version spread the
// rule's output across the page as extra columns, a statistics strip and three
// charts - which made a queue of leads look like a dashboard and buried the
// one thing somebody comes here to do. The owner called it over-designed and
// it was: the analysis is something you ASK for, and its answer belongs where
// the product puts every other answer.
//
// IT PROPOSES; A PERSON DECIDES, ONE AT A TIME (ADR-003). 采纳 is per row, and
// there is deliberately no "accept all" - the owner of a lead is who gets
// asked about it, so a bulk button would be dozens of decisions wearing the
// costume of one.
//
// 放弃 CLEARS THE PROPOSALS AND WRITES NOTHING. It is not a rejection anything
// records: this analysis was never stored, so dismissing it is the reader
// saying "not now", and the button says exactly that much. It is the only way
// back to the idle state, because the panel now OPENS with the answer.

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "failed"; readonly code: string }
  | {
      readonly kind: "done";
      readonly proposals: readonly AssignmentProposal[];
      readonly findings: readonly RoutingAdvice[];
    };

export function RoutingAssignPanel({
  canAssign,
  initial,
  onAnalyse,
  onAccept,
}: {
  readonly canAssign: boolean;
  /** What the server already worked out. Opening the page is asking. */
  readonly initial: {
    ok: boolean;
    error?: string;
    proposals?: AssignmentProposal[];
    findings?: RoutingAdvice[];
  };
  readonly onAnalyse: () => Promise<{
    ok: boolean;
    error?: string;
    proposals?: AssignmentProposal[];
    findings?: RoutingAdvice[];
  }>;
  readonly onAccept: (input: {
    leadId: string;
    ownerSub: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { ROUTING_TEXT, SIGNAL_ACTION_ERROR } = useMessages();
  const [state, setState] = useState<State>(
    initial.ok
      ? { kind: "done", proposals: initial.proposals ?? [], findings: initial.findings ?? [] }
      : { kind: "failed", code: initial.error ?? "denied" },
  );
  // Accepted rows leave the list by id rather than by re-running the analysis:
  // a re-run after every acceptance would renumber the load and reshuffle what
  // is left under the reader's hand.
  const [accepted, setAccepted] = useState<readonly string[]>([]);
  const [pending, start] = useTransition();

  const analyse = useCallback(() => {
    setState({ kind: "running" });
    setAccepted([]);
    start(async () => {
      const r = await onAnalyse();
      setState(
        r.ok
          ? { kind: "done", proposals: r.proposals ?? [], findings: r.findings ?? [] }
          : { kind: "failed", code: r.error ?? "denied" },
      );
    });
  }, [onAnalyse]);

  // THE OTHER BUTTON IS ON THE PAGE (owner: 智能分配按钮 = 标题行右侧 + 智能助手
  // 板块) - the lead module's title row, since 分派 folded into it. The page
  // and this dock are separate parallel routes, so they share no React tree
  // and no state; a window event is the smallest coupling that makes one
  // button drive the other, named once in routing-signal.ts.
  useEffect(() => {
    const run = () => analyse();
    window.addEventListener(ROUTING_ANALYSE_EVENT, run);
    return () => window.removeEventListener(ROUTING_ANALYSE_EVENT, run);
  }, [analyse]);

  const left =
    state.kind === "done" ? state.proposals.filter((p) => !accepted.includes(p.leadId)) : [];

  return (
    <Card className="flex flex-col gap-sm p-lg">
      <div className="flex items-baseline justify-between gap-sm">
        <span className="text-foreground text-label-lg">{ROUTING_TEXT.assignTitle}</span>
        {state.kind === "done" ? (
          <span className="text-muted-foreground tabular-nums text-body-sm">
            {ROUTING_TEXT.assignFound(state.proposals.length)}
          </span>
        ) : null}
      </div>

      {state.kind === "idle" ? (
        <p className="text-muted-foreground text-body-sm">{ROUTING_TEXT.assignIdle}</p>
      ) : null}
      {state.kind === "failed" ? (
        <StatusBadge tone="danger">
          {SIGNAL_ACTION_ERROR[state.code] ?? SIGNAL_ACTION_ERROR.denied}
        </StatusBadge>
      ) : null}

      {state.kind === "done" && left.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">
          {/* NOTHING TO MOVE IS AN ANSWER, and a different one from "not run
              yet". Saying so is what stops somebody pressing again to check. */}
          {accepted.length > 0 ? ROUTING_TEXT.assignAllDone : ROUTING_TEXT.assignNone}
        </p>
      ) : null}

      {left.map((p) => (
        <div key={p.leadId} className="border-border flex flex-col gap-2xs rounded-md border p-sm">
          <span className="text-foreground truncate text-body-sm">{p.companyName}</span>
          <span className="text-muted-foreground truncate text-body-sm">
            {ROUTING_TEXT.assignMove(p.currentOwner ?? ROUTING_TEXT.unowned, p.suggestedOwner)}
          </span>
          {/* THE REASON TRAVELS WITH THE PROPOSAL. "Why them" is the question a
              router is actually asked, and a suggestion that cannot answer it
              gets overridden by hand until nobody trusts it. */}
          <span className="text-muted-foreground truncate text-body-sm">
            {p.contenders === 1
              ? ROUTING_TEXT.basisSole(p.region, p.territoryName)
              : ROUTING_TEXT.basisTie(p.region, p.contenders, p.territoryName, p.load)}
          </span>
          {canAssign ? (
            <div>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await onAccept({
                      leadId: p.leadId,
                      ownerSub: p.suggestedOwner,
                    });
                    // Only a row that actually landed leaves the list. On a
                    // refusal it stays put with its button, rather than
                    // disappearing as though it had been applied.
                    if (r.ok) setAccepted((a) => [...a, p.leadId]);
                    else setState({ kind: "failed", code: r.error ?? "denied" });
                  })
                }
              >
                {ROUTING_TEXT.assignAccept}
              </Button>
            </div>
          ) : null}
        </div>
      ))}

      {/* WHAT COULD NOT BE PROPOSED, under the proposals rather than in a
          panel of its own. These are not moves to accept - each is a hole
          somewhere else, and the three reasons are three different people's
          jobs. */}
      {state.kind === "done" && state.findings.length > 0 ? (
        <div className="flex flex-col gap-2xs">
          <span className="text-muted-foreground text-label-sm">
            {ROUTING_TEXT.blockedTitle}
          </span>
          {state.findings.map((f) => (
            <span key={f.id} className="text-muted-foreground text-body-sm">
              {f.kind === "no_region"
                ? ROUTING_TEXT.adviceNoRegion(f.count)
                : f.kind === "no_territory"
                  ? ROUTING_TEXT.adviceNoTerritory(f.count)
                  : f.kind === "no_owner"
                    ? ROUTING_TEXT.adviceNoOwner(f.count)
                    : ROUTING_TEXT.adviceImbalance(f.sub ?? "", f.count, f.share ?? 0)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-xs">
        <Button size="sm" variant="secondary" disabled={pending} onClick={analyse}>
          {/* The panel arrives with an answer, so this button is almost always
              "take the numbers again" rather than "produce some". */}
          {state.kind === "idle" ? ROUTING_TEXT.assignRun : ROUTING_TEXT.assignAgain}
        </Button>
        {state.kind === "done" || state.kind === "failed" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setState({ kind: "idle" });
              setAccepted([]);
            }}
          >
            {ROUTING_TEXT.assignDiscard}
          </Button>
        ) : null}
      </div>

      {!canAssign ? (
        <p className="text-muted-foreground text-body-sm">{ROUTING_TEXT.denied}</p>
      ) : null}
    </Card>
  );
}
