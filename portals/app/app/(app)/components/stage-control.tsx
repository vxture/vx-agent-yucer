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
  DEFAULT_PROBABILITY,
  OPEN_STAGE_ORDER,
  STAGES,
  isRegression,
  isTerminal,
  isProbabilityOverridden,
  type Stage,
} from "../../domains/pipeline/lib/stage";
import {
  OPPORTUNITY_ERROR,
  OPPORTUNITY_TEXT,
  STAGE_LABEL,
} from "../lib/messages";

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
  readonly probability: number | null;
  readonly canAdvance: boolean;
  readonly onAdvance: (
    opportunityId: string,
    input: { to: string; reason?: string; reopen?: boolean },
  ) => Promise<{
    ok: boolean;
    stage?: string;
    reviewRequired?: boolean;
    error?: string;
  }>;
}

export function StageControl({
  opportunityId,
  stage,
  probability,
  canAdvance,
  onAdvance,
}: StageControlProps) {
  const closed = isTerminal(stage);
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
      <Section title={OPPORTUNITY_TEXT.advanceTitle}>
        <StatusBadge tone="neutral">
          {OPPORTUNITY_TEXT.advanceReadOnly}
        </StatusBadge>
      </Section>
    );
  }

  // A closed deal offers only the open stages, and only once reopen is ticked.
  // An open deal may go anywhere except where it already is.
  const choices: Stage[] = closed
    ? reopen
      ? [...OPEN_STAGE_ORDER]
      : []
    : STAGES.filter((s) => s !== stage);

  const regression = to !== "" && !closed && isRegression(stage, to);
  const reasonRequired = regression || (closed && reopen);
  const terminalTarget = to !== "" && isTerminal(to);
  const overridden = isProbabilityOverridden({ stage, probability });

  function submit() {
    if (to === "") return;
    setError(null);
    setDone(null);
    startTransition(() => {
      void onAdvance(opportunityId, {
        to,
        reason: reason.trim() || undefined,
        reopen: closed && reopen,
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
      });
    });
  }

  return (
    <Section
      title={OPPORTUNITY_TEXT.advanceTitle}
      description={OPPORTUNITY_TEXT.advanceDescription}
    >
      {closed ? (
        <>
          <StatusBadge tone="warning" dot>
            {OPPORTUNITY_TEXT.advanceClosedTitle}
          </StatusBadge>
          <p>{OPPORTUNITY_TEXT.advanceClosedDescription}</p>
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
            <option value="">-</option>
            {choices.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]} ({DEFAULT_PROBABILITY[s]}%)
              </option>
            ))}
          </NativeSelect>

          {regression ? (
            <StatusBadge tone="warning">
              {OPPORTUNITY_TEXT.advanceRegressionHint(STAGE_LABEL[stage])}
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
              pending || to === "" || (reasonRequired && !reason.trim())
            }
          >
            {OPPORTUNITY_TEXT.advanceSubmit}
          </Button>
        </>
      ) : null}

      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      {done ? (
        <>
          <StatusBadge tone="success" dot>
            {STAGE_LABEL[done.stage as Stage] ?? done.stage}
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
