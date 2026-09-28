"use client";

import { useState, useTransition } from "react";
import { Button, Field, FieldLabel, Input, StatusBadge, Textarea } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { DialogForm } from "./dialog-form";

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
  /** Which slice this snapshot is of, in the URL's own form. */
  readonly scopeKey: string;
  /** False when the member may read the forecast but not commit to one. */
  readonly canSubmit: boolean;
  /** What the rule computes right now for this period and scope. */
  readonly computed?: { readonly key: string; readonly label: string; readonly amount: number }[];
  readonly onSubmit: (
    period: string,
    scopeKey: string,
    call?: { amount?: number | null; note?: string | null },
  ) => Promise<{
    ok: boolean;
    period?: string;
    error?: string;
  }>;
}

export function SubmitForecast({ period, scopeKey, canSubmit, computed = [], onSubmit }: SubmitForecastProps) {
  const { PIPELINE_TEXT, FORECAST_ERROR, BOARD_TEXT } = useMessages();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  if (!canSubmit) {
    return (
      <Button size="sm" variant="outline" disabled title={PIPELINE_TEXT.snapshotDenied}>
        {PIPELINE_TEXT.snapshot}
      </Button>
    );
  }

  const submit = () =>
    start(async () => {
      const typed = amount.trim();
      const r = await onSubmit(period, scopeKey, {
        amount: typed === "" ? null : Number(typed),
        note: note.trim() || null,
      });
      setError(r.ok ? null : (FORECAST_ERROR[r.error ?? "denied"] ?? PIPELINE_TEXT.snapshotFailed));
      setDone(r.ok);
      if (r.ok) {
        setOpen(false);
        setAmount("");
        setNote("");
      }
    });

  return (
    <div className="flex items-center gap-xs">
      {done && !error ? <StatusBadge tone="success">{PIPELINE_TEXT.snapshotTaken}</StatusBadge> : null}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          setDone(false);
          setOpen(true);
        }}
      >
        {pending ? PIPELINE_TEXT.snapshotPending : PIPELINE_TEXT.snapshot}
      </Button>
      {open ? (
        <DialogForm
          open
          onOpenChange={(o: boolean) => {
            if (!o) setOpen(false);
          }}
          title={PIPELINE_TEXT.snapshotDialogTitle}
          description={PIPELINE_TEXT.snapshotDialogWhy}
          submitLabel={PIPELINE_TEXT.snapshotSubmit}
          submitting={pending}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
          {computed.length > 0 ? (
            <div>
              <p className="text-muted-foreground text-body-sm">{PIPELINE_TEXT.snapshotComputed}</p>
              <dl className="mt-2xs grid grid-cols-2 gap-x-md gap-y-2xs text-body-sm">
                {computed.map((c) => (
                  <div key={c.key} className="flex items-baseline justify-between gap-sm">
                    <dt className="text-muted-foreground">{c.label}</dt>
                    <dd className="text-foreground font-semibold tabular-nums">{BOARD_TEXT.wan(c.amount)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          <Field>
            <FieldLabel htmlFor="forecast-call">{PIPELINE_TEXT.callLabel}</FieldLabel>
            <Input
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
            <FieldLabel htmlFor="forecast-call-note">{PIPELINE_TEXT.callNoteLabel}</FieldLabel>
            <Textarea
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
