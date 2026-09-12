"use client";

import { useState, useTransition } from "react";
import {
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Section,
  ViewHeader,
  useToast,
} from "@vxture/design-ui";
import type { PricingPolicy } from "../../domains/catalog/lib/pricing-policy";
import { useMessages } from "../lib/i18n/provider";
import { FormActions, FormFields } from "./form-page";
import { Tag } from "./tag";

// 计价规则 - the currency this workspace prices in (incr/0044).
//
// WHY IT IS CONFIGURED AT ALL. "CNY" was in eleven places in the build - the
// line pricer, the pipeline's default, lead conversion, the price book's
// column, four pages' fallbacks. Eleven copies of one decision, none of them
// the workspace's. Every one of them reads this row now.
//
// ONE FIELD, deliberately. What else a pricing policy could hold - the floor
// discipline, a second currency with a rate - is a decision each, and a form
// that grew fields nobody had asked for would be inventing policy.

export function PricingPolicyConfig({
  policy,
  canWrite,
  onSave,
}: {
  readonly policy: PricingPolicy;
  readonly canWrite: boolean;
  readonly onSave: (input: PricingPolicy) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { PRICING_ERROR, PRICING_TEXT } = useMessages();
  const [pending, start] = useTransition();
  const [currency, setCurrency] = useState(policy.defaultCurrency);
  const { toast } = useToast();
  const dirty = currency.trim().toUpperCase() !== policy.defaultCurrency;

  const save = () =>
    start(async () => {
      const r = await onSave({ defaultCurrency: currency });
      toast(
        r.ok
          ? { tone: "success", title: PRICING_TEXT.saved }
          : { tone: "danger", title: PRICING_ERROR[r.error ?? "denied"] ?? r.error ?? "" },
      );
    });

  const discard = () => setCurrency(policy.defaultCurrency);

  return (
    <>
      <ViewHeader
        icon="scales"
        title={PRICING_TEXT.title}
        description={PRICING_TEXT.why}
        secondary={<Tag>{policy.defaultCurrency}</Tag>}
      />
      {/* INDENTED TO THE TITLE TEXT, not the icon - the same 80px
          (size-icon-2xl 48px + header gap-xl 32px) forecast-threshold-config
          and ageing-policy-config use, so content reads as belonging to
          "计价规则" the text. */}
      <div className="pl-20">
        <Section>
          <FormFields>
            <Field>
              <FieldLabel htmlFor="pricing-currency">{PRICING_TEXT.currencyLabel}</FieldLabel>
              <Input
                id="pricing-currency"
                className="max-w-[8rem] uppercase"
                maxLength={3}
                value={currency}
                disabled={pending || !canWrite}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
              <FieldDescription>{PRICING_TEXT.currencyHint}</FieldDescription>
            </Field>
          </FormFields>
        </Section>
        {canWrite ? (
          <div className="mt-lg">
            <FormActions
              saveLabel={PRICING_TEXT.save}
              discardLabel={PRICING_TEXT.discard}
              onSave={save}
              onDiscard={discard}
              pending={pending || !dirty}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
