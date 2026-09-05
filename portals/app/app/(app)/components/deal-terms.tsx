"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DialogForm,
  Input,
  Label,
  NativeSelect,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import {
  FORECAST_CATEGORIES,
  type ForecastCategory,
} from "../../domains/pipeline/lib/forecast";
import {
  DEFAULT_PROBABILITY,
  isTerminal,
  type Stage,
} from "../../domains/pipeline/lib/stage";
import { useMessages } from "../lib/i18n/provider";

// What the deal is worth, and how sure we are - A DIALOG since 2026-09-05.
//
// The analysis behind the change: these are five independent single-field
// facts, each a quick correction made WHILE LOOKING at the metrics the page
// already shows - not a coherent creation flow. A page would add a round trip
// to a one-field tweak; a permanent inline form was a form squatting on a
// display page. The ruling's own category is "flow operation → dialog", and
// this is one.
//
// Everything the inline form knew survives verbatim:
//   - only what the user CHANGED is sent (dirty-patch), so an untouched field
//     can never carry a refusal for the whole save;
//   - a closed deal's win rate is fixed by the stage machine and never sent;
//   - the category select offers only the pairings planCategoryChange accepts.

export interface DealTermsProps {
  readonly opportunityId: string;
  readonly stage: Stage;
  readonly amount: number | null;
  readonly currency: string;
  readonly probability: number | null;
  readonly expectedCloseAt: Date | null;
  readonly forecastCategory: ForecastCategory;
  readonly canEdit: boolean;
  /** The forecast bucket is a pro capability with its own permission; the
   * select is only rendered when the member actually holds it. */
  readonly canCategorize: boolean;
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
  canCategorize,
  onSave,
}: DealTermsProps) {
  const { FORECAST_LABEL, OPPORTUNITY_ERROR, OPPORTUNITY_TEXT } = useMessages();
  const closed = isTerminal(stage);
  const initial = {
    amount: amount == null ? "" : String(amount),
    probability: probability == null ? "" : String(probability),
    expectedCloseAt: asDateInput(expectedCloseAt),
    forecastCategory,
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** The value if the user changed it, undefined if they did not. */
  const dirty = (k: keyof typeof initial): string | undefined =>
    form[k] === initial[k] ? undefined : form[k];

  if (!canEdit) {
    return (
      <Section title={OPPORTUNITY_TEXT.termsTitle}>
        <StatusBadge tone="neutral">{OPPORTUNITY_TEXT.termsReadOnly}</StatusBadge>
      </Section>
    );
  }

  function save() {
    setError(null);
    startTransition(() => {
      // Only what the user actually CHANGED. Sending every field meant an
      // untouched one could carry a refusal for the whole save: a deal closed
      // through the stage control keeps whatever bucket it had, so resubmitting
      // that bucket against a now-terminal stage failed the entire edit and
      // named a field nobody touched.
      //
      // updateCommercialTerms refuses a fully empty patch with `empty_patch`,
      // so "changed nothing" still gets an honest answer.
      void onSave(opportunityId, {
        amount: dirty("amount"),
        currency,
        // A closed deal's win rate is fixed by the stage machine, so it is
        // never sent. Sending it would earn a terminal_probability_fixed
        // refusal for a field the user could not have changed.
        probability: closed ? undefined : dirty("probability"),
        expectedCloseAt: dirty("expectedCloseAt"),
        forecastCategory: canCategorize ? dirty("forecastCategory") : undefined,
      }).then((r) => {
        if (!r.ok) {
          setError(OPPORTUNITY_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
        } else {
          setSaved(true);
          setOpen(false);
        }
      });
    });
  }

  return (
    <Section title={OPPORTUNITY_TEXT.termsTitle} description={OPPORTUNITY_TEXT.termsDescription}>
      <div className="flex flex-wrap items-center gap-sm">
        <Button
          variant="secondary"
          onClick={() => {
            // Reopen from the CURRENT server values, not from a stale draft: a
            // save (or someone else's) may have moved them since last time.
            setForm(initial);
            setError(null);
            setSaved(false);
            setOpen(true);
          }}
        >
          {OPPORTUNITY_TEXT.termsOpen}
        </Button>
        {saved ? <StatusBadge tone="success">{OPPORTUNITY_TEXT.termsSaved}</StatusBadge> : null}
      </div>

      <DialogForm
        open={open}
        onOpenChange={setOpen}
        title={OPPORTUNITY_TEXT.termsTitle}
        description={OPPORTUNITY_TEXT.termsDescription}
        submitLabel={OPPORTUNITY_TEXT.termsSubmit}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
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
        {closed ? (
          <StatusBadge tone="neutral">{OPPORTUNITY_TEXT.termsTerminalLocked}</StatusBadge>
        ) : null}

        <Label htmlFor="terms-close">{OPPORTUNITY_TEXT.termsExpectedClose}</Label>
        <Input
          id="terms-close"
          type="date"
          value={form.expectedCloseAt}
          onChange={(e) => setForm({ ...form, expectedCloseAt: e.target.value })}
          disabled={pending}
        />

        {canCategorize ? (
          <>
            <Label htmlFor="terms-forecast">{OPPORTUNITY_TEXT.termsForecast}</Label>
            <NativeSelect
              id="terms-forecast"
              value={form.forecastCategory}
              onChange={(e) =>
                setForm({ ...form, forecastCategory: e.target.value as ForecastCategory })
              }
              disabled={pending}
            >
              {FORECAST_CATEGORIES.map((c) => (
                // `closed` is offered only on a terminal deal, and the open
                // three only on an open one - planCategoryChange refuses the
                // other pairings in both directions, so offering them would be
                // offering a refusal.
                <option key={c} value={c} disabled={c === "closed" ? !closed : closed}>
                  {FORECAST_LABEL[c]}
                </option>
              ))}
            </NativeSelect>
          </>
        ) : null}

        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </DialogForm>
    </Section>
  );
}
