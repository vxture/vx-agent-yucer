"use client";

import { useState, useTransition } from "react";
import { Button, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { ActionCard } from "./action-card";
import type { BriefTone } from "../../domains/pipeline/lib/brief";
import type { ForecastCategory } from "../../domains/pipeline/lib/forecast";

// One-click: file this deal under the category the rule suggests.
//
// The same act the forecast review page offers (applySuggestedCategory), moved
// to where the category is actually chosen. The server action re-derives the
// suggestion and refuses if the facts moved (suggestion_moved) - so this
// button cannot apply a stale opinion, which is what makes one-click safe
// here. ONE CARD PER FILE: reachable-codes.test.ts pairs this file's action
// with this file's dictionary.

export function CategoryActionCard({
  opportunityId,
  to,
  severity,
  reason,
  onApply,
}: {
  readonly opportunityId: string;
  readonly to: ForecastCategory;
  readonly severity: BriefTone;
  readonly reason: string;
  readonly onApply: (input: { opportunityId: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { WAR_ROOM_TEXT, FORECAST_RULE_ERROR, FORECAST_LABEL } = useMessages();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  return (
    <ActionCard
      severity={severity}
      title={WAR_ROOM_TEXT.applyCategory(FORECAST_LABEL[to] ?? to)}
      reason={reason}
    >
      {done ? (
        <StatusBadge tone="success">{WAR_ROOM_TEXT.applied}</StatusBadge>
      ) : (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(() => {
              void onApply({ opportunityId }).then((r) => {
                setErr(r.ok ? null : (FORECAST_RULE_ERROR[r.error ?? "denied"] ?? FORECAST_RULE_ERROR.denied));
                setDone(r.ok);
              });
            })
          }
        >
          {WAR_ROOM_TEXT.applyCta}
        </Button>
      )}
      {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
    </ActionCard>
  );
}
