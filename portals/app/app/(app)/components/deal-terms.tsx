"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, NativeSelect, PageSection, StatusBadge } from "@vxture/design-system";
import { FORECAST_CATEGORIES, type ForecastCategory } from "../../domains/pipeline/lib/forecast";
import { DEFAULT_PROBABILITY, isTerminal, type Stage } from "../../domains/pipeline/lib/stage";
import { FORECAST_LABEL, OPPORTUNITY_ERROR, OPPORTUNITY_TEXT } from "../lib/messages";

// What the deal is worth, and how sure we are.
//
// This is the surface that makes the win-rate OVERRIDE reachable. The stage
// machine's rule is that a human's number wins and the machine stops rewriting
// it - but until someone can actually type one, that rule only ever expresses
// itself as the machine declining to overwrite a value nothing could produce.
//
// A closed deal shows the fields disabled rather than hidden: "the win rate is
// fixed at 100% because this is won" is information, and a vanished field is
// not.

export interface DealTermsProps {
  readonly opportunityId: string;
  readonly stage: Stage;
  readonly amount: number | null;
  readonly currency: string;
  readonly probability: number | null;
  readonly expectedCloseAt: Date | null;
  readonly forecastCategory: ForecastCategory;
  readonly canEdit: boolean;
  readonly onSave: (
    opportunityId: string,
    input: {
      amount?: string;
      currency?: string;
      probability?: string;
      expectedCloseAt?: string;
      forecastCategory?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
}

const asDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export function DealTerms({
  opportunityId,
  stage,
  amount,
  currency,
  probability,
  expectedCloseAt,
  forecastCategory,
  canEdit,
  onSave,
}: DealTermsProps) {
  const closed = isTerminal(stage);
  const [form, setForm] = useState({
    amount: amount == null ? "" : String(amount),
    probability: probability == null ? "" : String(probability),
    expectedCloseAt: asDateInput(expectedCloseAt),
    forecastCategory,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!canEdit) {
    return (
      <PageSection title={OPPORTUNITY_TEXT.termsTitle}>
        <StatusBadge tone="neutral">{OPPORTUNITY_TEXT.termsReadOnly}</StatusBadge>
      </PageSection>
    );
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(() => {
      void onSave(opportunityId, {
        amount: form.amount,
        currency,
        // A closed deal's win rate is fixed by the stage machine, so it is not
        // sent at all. Sending it would earn a terminal_probability_fixed
        // refusal for a field the user could not have changed.
        probability: closed ? undefined : form.probability,
        expectedCloseAt: form.expectedCloseAt,
        forecastCategory: form.forecastCategory,
      }).then((r) => {
        if (!r.ok) setError(OPPORTUNITY_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
        else setSaved(true);
      });
    });
  }

  return (
    <PageSection title={OPPORTUNITY_TEXT.termsTitle} description={OPPORTUNITY_TEXT.termsDescription}>
      <Label htmlFor="terms-amount">
        {OPPORTUNITY_TEXT.termsAmount} ({currency})
      </Label>
      <Input
        id="terms-amount"
        inputMode="decimal"
        value={form.amount}
        onChange={(e) => setForm({ ...form, amount: e.target.value })}
        disabled={pending}
      />

      <Label htmlFor="terms-probability">{OPPORTUNITY_TEXT.termsProbability}</Label>
      <Input
        id="terms-probability"
        inputMode="numeric"
        value={closed ? String(DEFAULT_PROBABILITY[stage]) : form.probability}
        onChange={(e) => setForm({ ...form, probability: e.target.value })}
        disabled={pending || closed}
      />
      {closed ? <StatusBadge tone="neutral">{OPPORTUNITY_TEXT.termsTerminalLocked}</StatusBadge> : null}

      <Label htmlFor="terms-close">{OPPORTUNITY_TEXT.termsExpectedClose}</Label>
      <Input
        id="terms-close"
        type="date"
        value={form.expectedCloseAt}
        onChange={(e) => setForm({ ...form, expectedCloseAt: e.target.value })}
        disabled={pending}
      />

      <Label htmlFor="terms-forecast">{OPPORTUNITY_TEXT.termsForecast}</Label>
      <NativeSelect
        id="terms-forecast"
        value={form.forecastCategory}
        onChange={(e) => setForm({ ...form, forecastCategory: e.target.value as ForecastCategory })}
        disabled={pending}
      >
        {FORECAST_CATEGORIES.map((c) => (
          // `closed` is offered only on a terminal deal, and the open three only
          // on an open one - planCategoryChange refuses the other pairings in
          // both directions, so offering them would be offering a refusal.
          <option key={c} value={c} disabled={c === "closed" ? !closed : closed}>
            {FORECAST_LABEL[c]}
          </option>
        ))}
      </NativeSelect>

      <Button onClick={save} disabled={pending}>
        {OPPORTUNITY_TEXT.termsSubmit}
      </Button>

      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {saved ? <StatusBadge tone="success">{OPPORTUNITY_TEXT.termsSaved}</StatusBadge> : null}
    </PageSection>
  );
}
