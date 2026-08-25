"use client";

import { useState, useTransition } from "react";
import {
  Button,
  MetricGrid,
  Section,
  StatusBadge,
  type MetricGridItem,
} from "@vxture/design-ui";
import type { HealthResult } from "../../domains/account/lib/health";
import { CHAIN_TEXT } from "../lib/messages";
import { healthReasonText } from "../lib/messages";
import { healthTone } from "../lib/view-model";

// Account health, with its reasons.
//
// The spec says health_score is derived, exists for sorting and alerting, and is
// never the sole basis for a business decision. A panel that showed only the
// number would invite exactly that misuse - so the contributions are rendered
// beside it, and the biggest negative one is called out by name.
//
// "This account is at 34" is not actionable. "No contact for 48 days, one
// overdue instalment, delivery amber" is.

const FACTOR_LABEL: Record<string, string> = {
  pipeline: CHAIN_TEXT.factorPipeline,
  recency: CHAIN_TEXT.factorRecency,
  delivery: CHAIN_TEXT.factorDelivery,
  collections: CHAIN_TEXT.factorCollections,
};

export interface HealthPanelProps {
  readonly accountId: string;
  readonly health: HealthResult;
  readonly canRecompute: boolean;
  readonly onRecompute: (
    accountId: string,
  ) => Promise<{ ok: boolean; score?: number; error?: string }>;
}

export function HealthPanel({
  accountId,
  health,
  canRecompute,
  onRecompute,
}: HealthPanelProps) {
  const [current, setCurrent] = useState(health);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function recompute() {
    setError(null);
    startTransition(() => {
      void onRecompute(accountId).then((r) => {
        if (!r.ok) setError(r.error ?? "denied");
        else if (r.score != null) setCurrent({ ...current, score: r.score });
      });
    });
  }

  const items: MetricGridItem[] = current.contributions.map((c) => ({
    id: c.factor,
    label: FACTOR_LABEL[c.factor] ?? c.factor,
    // The sign is kept. A contribution of -25 read as "25" would invert the
    // meaning of the panel.
    value: `${c.points > 0 ? "+" : ""}${c.points}`,
    trend: healthReasonText(c.reason),
    tone: c.points < 0 ? "danger" : "success",
  }));

  return (
    <Section
      title={CHAIN_TEXT.healthTitle}
      description={CHAIN_TEXT.healthDescription}
      action={
        canRecompute ? (
          <Button
            variant="outline"
            size="sm"
            onClick={recompute}
            disabled={pending}
          >
            {CHAIN_TEXT.recompute}
          </Button>
        ) : null
      }
    >
      <StatusBadge tone={healthTone(current.score)}>
        {current.score}
      </StatusBadge>

      {current.primaryConcern ? (
        <StatusBadge tone="warning">
          {CHAIN_TEXT.primaryConcern}:{" "}
          {healthReasonText(current.primaryConcern.reason)}
        </StatusBadge>
      ) : null}

      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      <MetricGrid items={items} />
    </Section>
  );
}
