"use client";

import { useState, useTransition } from "react";
import { Button, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// The control that takes a forecast snapshot.
//
// It sits in the trajectory section's header rather than beside the totals
// board above it, and the placement is the argument: the board shows what the
// pipeline is RIGHT NOW and is recomputed on every load, while a snapshot is a
// reading that gets frozen and argued over later. Putting the button beside
// the live number would suggest it saves that number; putting it on the series
// says it adds a point to the series, which is what it does.

export interface SubmitForecastProps {
  readonly period: string;
  /** Which slice this snapshot is of, in the URL's own form. */
  readonly scopeKey: string;
  /** False when the member may read the forecast but not commit to one. */
  readonly canSubmit: boolean;
  readonly onSubmit: (period: string, scopeKey: string) => Promise<{
    ok: boolean;
    period?: string;
    error?: string;
  }>;
}

export function SubmitForecast({
  period,
  scopeKey,
  canSubmit,
  onSubmit,
}: SubmitForecastProps) {
  const { PIPELINE_TEXT, FORECAST_ERROR } = useMessages();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!canSubmit) {
    // Visible and disabled, with the reason. A permission gap normally removes
    // a control entirely, but this one is different: the person reading a
    // forecast is often not the person who commits to it, and a missing button
    // would read as "this product cannot do that" rather than "not your job".
    return (
      <Button size="sm" variant="outline" disabled title={PIPELINE_TEXT.snapshotDenied}>
        {PIPELINE_TEXT.snapshot}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-xs">
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {/* The confirmation says what was ADDED, not "saved". A snapshot cannot
          be edited or removed - UPDATE is revoked on the table - so "saved"
          would imply an undo that does not exist. */}
      {done && !error ? (
        <StatusBadge tone="success">{PIPELINE_TEXT.snapshotTaken}</StatusBadge>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(() => {
            void onSubmit(period, scopeKey).then((r) => {
              setError(
                r.ok ? null : (FORECAST_ERROR[r.error ?? "denied"] ?? PIPELINE_TEXT.snapshotFailed),
              );
              setDone(r.ok);
            });
          })
        }
      >
        {pending ? PIPELINE_TEXT.snapshotPending : PIPELINE_TEXT.snapshot}
      </Button>
    </div>
  );
}
