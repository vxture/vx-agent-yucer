"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Button,
  Field,
  FieldLabel,
  Input,
  StatusBadge,
  Textarea,
} from "@vxture/design-ui";
import { formatMoney } from "../lib/view-model";
import { useMemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { DialogForm } from "./dialog-form";
import type { ForecastConfirmationView } from "../lib/forecast-confirmation";

// Submitting a forecast snapshot (预测检视台, YC-069 section 11).
//
// A DIALOG since incr/0096: the four category totals the rule computed are
// shown read-only - they are what the snapshot stores, and nobody types them -
// and beside them the manager's call (主管预估数) and a note, both optional.
// The call is a second number, not an override: the snapshot keeps both, and
// accuracy is scored for each.
//
// The confirmation says what was ADDED, not "saved". A snapshot cannot be
// edited or removed - UPDATE is revoked on the table - so "saved" would imply
// an undo that does not exist.

export interface SubmitForecastProps {
  readonly period: string;
  readonly currency: string;
  readonly contextLabel?: string;
  /** Which slice this snapshot is of, in the URL's own form. */
  readonly scopeKey: string;
  /** False when the member may read the forecast but not commit to one. */
  readonly canSubmit: boolean;
  readonly onSubmit: (
    period: string,
    scopeKey: string,
    call?: { amount?: number | null; note?: string | null },
    token?: string,
  ) => Promise<{
    ok: boolean;
    period?: string;
    error?: string;
  }>;
  readonly onPrepare: (
    period: string,
    scopeKey: string,
  ) => Promise<
    | { ok: true; confirmation: ForecastConfirmationView }
    | { ok: false; error: string }
  >;
}

export function SubmitForecast({
  period,
  scopeKey,
  canSubmit,
  onSubmit,
  onPrepare,
  currency,
  contextLabel,
}: SubmitForecastProps) {
  const {
    PIPELINE_TEXT,
    FORECAST_ERROR,
    ATTAINMENT_TEXT: { workspace: T },
    ATTAINMENT_PLAN_TEXT: PT,
  } = useMessages();
  const router = useRouter();
  const locale = useLocale();
  const nameOf = useMemberName();
  const scopeLabel = scopeKey.startsWith("owner:")
    ? (nameOf(scopeKey.slice(6)) ?? T.scopeUnavailable)
    : (contextLabel ?? T.wholeTeam);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] =
    useState<ForecastConfirmationView | null>(null);
  const confirmationErrors: Record<string, string> = {
    confirmation_changed: PT.confirmChanged,
    confirmation_expired: PT.confirmExpired,
    confirmation_denied: PT.confirmDenied,
    confirmation_conflict: PT.confirmConflict,
    confirmation_failed: PT.confirmFailed,
  };
  const loadPreview = async () => {
    setConfirmation(null);
    try {
      const r = await onPrepare(period, scopeKey);
      if (r.ok) setConfirmation(r.confirmation);
      else
        setError(
          confirmationErrors[r.error] ??
            FORECAST_ERROR[r.error] ??
            PT.confirmFailed,
        );
    } catch {
      setError(PT.confirmFailed);
    }
  };

  const computed = confirmation
    ? ([
        [PIPELINE_TEXT.tCommit, confirmation.totals.commitAmount],
        [PIPELINE_TEXT.tBestCase, confirmation.totals.bestCaseAmount],
        [PIPELINE_TEXT.tPipeline, confirmation.totals.pipelineAmount],
        [PIPELINE_TEXT.tClosed, confirmation.totals.closedAmount],
      ] as const)
    : [];

  if (!canSubmit) {
    return (
      <Button
        size="xl"
        className="font-medium"
        variant="outline"
        disabled
        title={PIPELINE_TEXT.snapshotDenied}
      >
        {T.submit}
      </Button>
    );
  }

  const submit = () =>
    start(async () => {
      if (!confirmation) return;
      try {
        const typed = amount.trim();
        const r = await onSubmit(
          period,
          scopeKey,
          {
            amount: typed === "" ? null : Number(typed),
            note: note.trim() || null,
          },
          confirmation.token,
        );
        setError(
          r.ok
            ? null
            : (confirmationErrors[r.error ?? ""] ??
                FORECAST_ERROR[r.error ?? "denied"] ??
                PIPELINE_TEXT.snapshotFailed),
        );
        setDone(r.ok);
        if (r.ok) {
          setOpen(false);
          setAmount("");
          setNote("");
          router.refresh();
        } else if (r.error === "confirmation_changed") {
          await loadPreview();
        } else if (r.error === "confirmation_expired") {
          setConfirmation(null);
        }
      } catch {
        setDone(false);
        setError(T.submitUnconfirmed);
      }
    });

  return (
    <div className="flex items-center gap-xs">
      {done && !error ? (
        <StatusBadge tone="success">{T.submitDone}</StatusBadge>
      ) : null}
      <Button
        size="xl"
        className="font-medium"
        disabled={pending}
        onClick={() => {
          setError(null);
          setDone(false);
          setOpen(true);
          start(loadPreview);
        }}
      >
        {pending ? T.submitPending : T.submit}
      </Button>
      {open ? (
        <DialogForm
          open
          onOpenChange={(o: boolean) => {
            if (!o && !pending) setOpen(false);
          }}
          title={T.submitTitle}
          description={`${period} / ${scopeLabel} / ${confirmation?.currency ?? currency}. ${T.snapshotHint} ${PIPELINE_TEXT.snapshotDialogWhy}`}
          submitLabel={T.submitConfirm}
          submitting={pending}
          submitDisabled={!confirmation}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
          {!confirmation ? (
            <Button
              size="md"
              variant="outline"
              disabled={pending}
              onClick={() => start(loadPreview)}
            >
              {pending ? PT.preparing : PT.prepare}
            </Button>
          ) : null}
          {confirmation ? (
            <div className="flex flex-col gap-xs text-body-small">
              <span className="text-muted-foreground">{PT.confirmBasis}</span>
              <span>
                {confirmation.basis === null
                  ? PT.confirmHidden
                  : (() => {
                      const basis = confirmation.basis;
                      return !basis || basis.target === null
                        ? PT.confirmNoTarget
                        : `${basis.sourceKind === "sales_plan" ? `V${basis.version}` : PT.legacy} \u00b7 ${formatMoney(Number(basis.target), basis.currency ?? confirmation.currency, locale)}`;
                    })()}
              </span>
              <span className="text-muted-foreground">
                {PT.confirmAt}{" "}
                {new Date(confirmation.observedAt).toLocaleString(locale, {
                  timeZone: "UTC",
                })}{" "}
                UTC
              </span>
            </div>
          ) : null}
          {confirmation && computed.length > 0 ? (
            <div>
              <p className="text-muted-foreground text-body-small">
                {PIPELINE_TEXT.snapshotComputed}
              </p>
              <dl className="mt-2xs grid grid-cols-2 gap-x-md gap-y-2xs text-body-small">
                {computed.map(([label, amount]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-sm"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-foreground font-semibold tabular-nums">
                      {formatMoney(amount.amount, amount.currency, locale)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          <Field>
            <FieldLabel htmlFor="forecast-call">
              {PIPELINE_TEXT.callLabel}
            </FieldLabel>
            <Input
              disabled={pending}
              className="h-control-xl"
              id="forecast-call"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="forecast-call-note">
              {PIPELINE_TEXT.callNoteLabel}
            </FieldLabel>
            <Textarea
              disabled={pending}
              id="forecast-call-note"
              value={note}
              maxLength={500}
              placeholder={PIPELINE_TEXT.callNoteHint}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </DialogForm>
      ) : null}
    </div>
  );
}
