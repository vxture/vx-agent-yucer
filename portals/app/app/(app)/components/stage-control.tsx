"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Checkbox,
  Label,
  NativeSelect,
  Section,
  StatusBadge,
  Textarea,
} from "@vxture/design-ui";
import {
  DEFAULT_STAGE_DEFINITIONS,
  defaultProbabilityFor,
  openStageOrder,
  isRegression,
  isTerminal,
  isProbabilityOverridden,
  statusFor,
  type Stage,
  type StageDefinition,
} from "../../domains/pipeline/lib/stage";
import { OPPORTUNITY_ABANDON_REASONS, OPPORTUNITY_LOSE_REASONS } from "../../domains/shared/funnel-exit";
import { useMessages } from "../lib/i18n/provider";
import { stageLabelFor } from "../lib/view-model";
import { Tag } from "./tag";

// Moving a deal, with the rule visible before the click rather than after it.
//
// The reason field appears when the move is a REGRESSION or a REOPEN, which are
// exactly the two cases planStageChange() refuses without one. This is a hint,
// not the enforcement: the server re-decides every rule, so a request that
// bypasses this form entirely gets the same refusal. But a form that let someone
// type a stage change and then rejected it for a reason it could have shown up
// front is a form that trains people to distrust it.
//
// Reopening is a CHECKBOX, not a stage in the picker. A closed deal's outcome
// has already been reported and counted; rewriting it must be a deliberate act,
// not a mis-click on a dropdown - which is why the rule demands explicit intent.

export interface StageControlProps {
  readonly opportunityId: string;
  readonly stage: Stage;
  /** The deal's status. An abandoned deal is closed at whatever stage it sits
   *  (YC-065 R6), so the stage alone cannot say whether it is closed. */
  readonly status?: string;
  readonly probability: number | null;
  readonly canAdvance: boolean;
  /** May this member give the deal up (pipeline.opportunity.abandon). */
  readonly canAbandon?: boolean;
  /** Why it ended, when it ended lost or abandoned - shown on a closed deal. */
  readonly exitReason?: string | null;
  /** The workspace's own stage catalog (incr/0057). Optional and defaulted
   *  to the shipped seven so every caller keeps compiling unchanged until it
   *  threads the real thing through - see stage.ts's own header. */
  readonly stageDefinitions?: readonly StageDefinition[];
  /** Inside a host that already titles it (a panel or drawer on the deal
   *  page, deal batch 2): the body without its own heading. */
  readonly hideTitle?: boolean;
  readonly onAdvance: (
    opportunityId: string,
    input: { to: string; reason?: string; reopen?: boolean; exitReason?: { code: string; note?: string } },
  ) => Promise<{
    ok: boolean;
    stage?: string;
    reviewRequired?: boolean;
    error?: string;
  }>;
  readonly onAbandon?: (
    opportunityId: string,
    input: { reasonCode: string; note?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function StageControl({
  opportunityId,
  stage,
  status = "open",
  probability,
  canAdvance,
  canAbandon = false,
  exitReason = null,
  stageDefinitions = DEFAULT_STAGE_DEFINITIONS,
  hideTitle = false,
  onAdvance,
  onAbandon,
}: StageControlProps) {
  const { OPPORTUNITY_ERROR, OPPORTUNITY_TEXT, STAGE_LABEL, EXIT_REASON_LABEL } = useMessages();
  const abandonedDeal = status === "abandoned";
  const closed = isTerminal(stage, stageDefinitions) || abandonedDeal;
  const [exitCode, setExitCode] = useState("");
  const [exitNote, setExitNote] = useState("");
  const [abandoning, setAbandoning] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [to, setTo] = useState<Stage | "">("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    stage: string;
    reviewRequired: boolean;
  } | null>(null);

  if (!canAdvance) {
    return (
      <Section title={hideTitle ? undefined : OPPORTUNITY_TEXT.advanceTitle}>
        <Tag>
          {OPPORTUNITY_TEXT.advanceReadOnly}
        </Tag>
      </Section>
    );
  }

  // A closed deal offers only the open stages, and only once reopen is ticked.
  // An open deal may go anywhere except where it already is.
  const choices: Stage[] = closed
    ? reopen
      ? [...openStageOrder(stageDefinitions)]
      : []
    : stageDefinitions.map((s) => s.code).filter((s) => s !== stage);

  const regression = to !== "" && !closed && isRegression(stage, to, stageDefinitions);
  const reasonRequired = regression || (closed && reopen);
  const terminalTarget = to !== "" && isTerminal(to, stageDefinitions);
  // A LOSS SAYS WHY (R6): the reason is asked for here, before the click,
  // and the server refuses the move without it.
  const lostTarget = to !== "" && statusFor(to, stageDefinitions) === "lost";
  const exitNoteRequired = exitCode === "other" && !exitNote.trim();
  const exitIncomplete = lostTarget && (exitCode === "" || exitNoteRequired);
  const overridden = isProbabilityOverridden({ stage, probability }, stageDefinitions);

  function submit() {
    if (to === "") return;
    setError(null);
    setDone(null);
    startTransition(() => {
      void onAdvance(opportunityId, {
        to,
        reason: reason.trim() || undefined,
        reopen: closed && reopen,
        ...(lostTarget ? { exitReason: { code: exitCode, note: exitNote.trim() || undefined } } : {}),
      }).then((r) => {
        if (!r.ok) {
          // The server's own violation code, mapped to a sentence. A generic
          // "failed" would hide the difference between "you lack the
          // permission" and "that move needs a reason".
          setError(
            OPPORTUNITY_ERROR[r.error ?? "denied"] ?? r.error ?? "denied",
          );
          return;
        }
        setDone({
          stage: r.stage ?? to,
          reviewRequired: r.reviewRequired === true,
        });
        setReason("");
        setTo("");
        setExitCode("");
        setExitNote("");
      });
    });
  }

  function submitAbandon() {
    if (!onAbandon || exitCode === "" || exitNoteRequired) return;
    setError(null);
    startTransition(() => {
      void onAbandon(opportunityId, { reasonCode: exitCode, note: exitNote.trim() || undefined }).then((r) => {
        if (!r.ok) {
          setError(OPPORTUNITY_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
          return;
        }
        setAbandoning(false);
        setExitCode("");
        setExitNote("");
      });
    });
  }

  // The reason picker, shared by a loss and an abandonment - two menus over
  // one vocabulary (shared/funnel-exit.ts), never the same list twice.
  const exitFields = (menu: readonly string[], label: string) => (
    <>
      <Label htmlFor="exit-reason">{label}</Label>
      <NativeSelect id="exit-reason" value={exitCode} onChange={(e) => setExitCode(e.target.value)} disabled={pending}>
        <option value="">{OPPORTUNITY_TEXT.selectNone}</option>
        {menu.map((c) => (
          <option key={c} value={c}>
            {EXIT_REASON_LABEL[c] ?? c}
          </option>
        ))}
      </NativeSelect>
      {exitCode !== "" ? (
        <>
          <Label htmlFor="exit-note">{OPPORTUNITY_TEXT.advanceExitNote}</Label>
          <Textarea id="exit-note" value={exitNote} onChange={(e) => setExitNote(e.target.value)} disabled={pending} />
          {exitNoteRequired ? <StatusBadge tone="warning">{OPPORTUNITY_TEXT.advanceExitNoteRequired}</StatusBadge> : null}
        </>
      ) : null}
    </>
  );

  return (
    <Section
      title={hideTitle ? undefined : OPPORTUNITY_TEXT.advanceTitle}
      description={hideTitle ? undefined : OPPORTUNITY_TEXT.advanceDescription}
    >
      {closed ? (
        <>
          <StatusBadge tone="warning" dot>
            {abandonedDeal ? OPPORTUNITY_TEXT.abandonedTitle : OPPORTUNITY_TEXT.advanceClosedTitle}
          </StatusBadge>
          {exitReason ? <Tag>{OPPORTUNITY_TEXT.exitRecorded(EXIT_REASON_LABEL[exitReason] ?? exitReason)}</Tag> : null}
          <p>{abandonedDeal ? OPPORTUNITY_TEXT.abandonedDescription : OPPORTUNITY_TEXT.advanceClosedDescription}</p>
          <Label>
            <Checkbox
              checked={reopen}
              onCheckedChange={(v) => {
                setReopen(v === true);
                setTo("");
              }}
            />
            {OPPORTUNITY_TEXT.advanceReopen}
          </Label>
          {reopen ? <p>{OPPORTUNITY_TEXT.advanceReopenHint}</p> : null}
        </>
      ) : null}

      {choices.length > 0 ? (
        <>
          <Label htmlFor="stage-to">{OPPORTUNITY_TEXT.advanceTo}</Label>
          <NativeSelect
            id="stage-to"
            value={to}
            onChange={(e) => setTo(e.target.value as Stage)}
            disabled={pending}
          >
            <option value="">{OPPORTUNITY_TEXT.selectNone}</option>
            {choices.map((s) => (
              <option key={s} value={s}>
                {stageLabelFor(s, stageDefinitions, STAGE_LABEL)} ({defaultProbabilityFor(s, stageDefinitions)}%)
              </option>
            ))}
          </NativeSelect>

          {regression ? (
            <StatusBadge tone="warning">
              {OPPORTUNITY_TEXT.advanceRegressionHint(stageLabelFor(stage, stageDefinitions, STAGE_LABEL))}
            </StatusBadge>
          ) : null}

          {/* Which way the win rate will move, stated before the click. An
              override silently overwritten on a terminal move is the surprise
              this line exists to prevent. */}
          {terminalTarget && overridden ? (
            <StatusBadge tone="info">
              {OPPORTUNITY_TEXT.advanceOverrideReset}
            </StatusBadge>
          ) : null}
          {!terminalTarget && overridden && to !== "" ? (
            <StatusBadge tone="info">
              {OPPORTUNITY_TEXT.advanceOverrideKept}
            </StatusBadge>
          ) : null}
          {terminalTarget ? (
            <StatusBadge tone="warning">
              {OPPORTUNITY_TEXT.advanceTerminalHint}
            </StatusBadge>
          ) : null}

          {lostTarget ? exitFields(OPPORTUNITY_LOSE_REASONS, OPPORTUNITY_TEXT.advanceExitReason) : null}

          {reasonRequired || reason ? (
            <>
              <Label htmlFor="stage-reason">
                {OPPORTUNITY_TEXT.advanceReason}
              </Label>
              <Textarea
                id="stage-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={OPPORTUNITY_TEXT.advanceReasonPlaceholder}
                disabled={pending}
              />
              {reasonRequired && !reason.trim() ? (
                <StatusBadge tone="warning">
                  {closed && reopen
                    ? OPPORTUNITY_TEXT.advanceReasonRequiredReopen
                    : OPPORTUNITY_TEXT.advanceReasonRequired}
                </StatusBadge>
              ) : null}
            </>
          ) : null}

          <Button
            onClick={submit}
            // Disabled on the two conditions the server would refuse anyway.
            // Everything else is left enabled: a button disabled for a reason
            // the user cannot see is worse than a refusal that explains itself.
            disabled={
              pending || to === "" || (reasonRequired && !reason.trim()) || exitIncomplete
            }
          >
            {OPPORTUNITY_TEXT.advanceSubmit}
          </Button>
        </>
      ) : null}

      {/* 放弃 (R6): only on an open deal, and a separate act from moving it -
          giving up is not a stage, and the reason menu is our decision's,
          not the customer's. */}
      {!closed && canAbandon && onAbandon ? (
        abandoning ? (
          <>
            <StatusBadge tone="warning">{OPPORTUNITY_TEXT.abandonHint}</StatusBadge>
            {exitFields(OPPORTUNITY_ABANDON_REASONS, OPPORTUNITY_TEXT.abandonReason)}
            <div className="flex gap-sm">
              <Button variant="outline" onClick={() => { setAbandoning(false); setExitCode(""); setExitNote(""); }} disabled={pending}>
                {OPPORTUNITY_TEXT.abandonCancel}
              </Button>
              {/* The confirm step IS the reason form above: nobody reaches
                  this button without choosing why - the DS asks for that to
                  be said rather than silently skipped. */}
              <Button
                variant="destructive"
                confirmExempt={OPPORTUNITY_TEXT.abandonExempt}
                onClick={submitAbandon}
                disabled={pending || exitCode === "" || exitNoteRequired}
              >
                {OPPORTUNITY_TEXT.abandonSubmit}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="ghost" onClick={() => { setAbandoning(true); setTo(""); setExitCode(""); }} disabled={pending}>
            {OPPORTUNITY_TEXT.abandonOpen}
          </Button>
        )
      ) : null}

      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      {done ? (
        <>
          <StatusBadge tone="success" dot>
            {stageLabelFor(done.stage, stageDefinitions, STAGE_LABEL)}
          </StatusBadge>
          {/* Surfaced, not enforced. Blocking the close until a review exists
              would push people to leave dead deals open, which is worse for
              every number than a closed deal missing its post-mortem. */}
          {done.reviewRequired ? (
            <StatusBadge tone="warning">
              {OPPORTUNITY_TEXT.advanceReviewRequired}
            </StatusBadge>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}
