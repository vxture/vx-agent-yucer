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
import { useMessages } from "../lib/i18n/provider";
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
  const { CHAIN_TEXT, healthReasonText } = useMessages();

  // INSIDE the component, not at module scope. It was a module constant, which
  // reads as the cheaper thing to do - build the map once - and is wrong the
  // moment the labels come from a dictionary: a module constant is evaluated
  // when the file is imported, so it would freeze whichever locale happened to
  // load first and hand every later reader that one.
  const FACTOR_LABEL: Record<string, string> = {
    pipeline: CHAIN_TEXT.factorPipeline,
    recency: CHAIN_TEXT.factorRecency,
    delivery: CHAIN_TEXT.factorDelivery,
    collections: CHAIN_TEXT.factorCollections,
  };

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

      {/* columns={2}, and the third time this has come up is worth naming as a
          rule: the DS's grids break on the VIEWPORT while every grid in this
          product sits in a pane sized by the shell. On the theatre page the
          centre column is 768px - viewport, less a 320px dossier, a 400px deck
          and the insets - so four cards get ~170 each and their labels clip to
          one glyph. Two columns is the only lever MetricGrid offers; a
          container query is what the case wants, and the DS has none. */}
      <MetricGrid items={items} columns={2} />
    </Section>
  );
}
