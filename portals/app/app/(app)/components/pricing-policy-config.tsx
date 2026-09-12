"use client";

import { useState, useTransition } from "react";
import {
  Field,
  FieldDescription,
  FieldLabel,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  ViewHeader,
  useToast,
} from "@vxture/design-ui";
import { SUPPORTED_CURRENCIES, type PricingPolicy } from "../../domains/catalog/lib/pricing-policy";
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
  const { CURRENCY_LABEL, CURRENCY_SYMBOL, PRICING_ERROR, PRICING_TEXT } = useMessages();
  const [pending, start] = useTransition();
  const [currency, setCurrency] = useState(policy.defaultCurrency);
  const { toast } = useToast();
  const dirty = currency !== policy.defaultCurrency;

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
              {/* THE SYMBOL IS SPLIT OUT of the option rows (owner, 2026-09-12):
                  it lives only in the closed trigger, next to the code. Each
                  open-list row carries just the code and the muted, right-
                  aligned Chinese name - never the trigger's own chevron, since
                  that name never renders in the trigger at all. */}
              <Select value={currency} onValueChange={setCurrency} disabled={pending || !canWrite}>
                <SelectTrigger id="pricing-currency" className="max-w-40">
                  <span className="flex items-center gap-xs">
                    <span className="text-muted-foreground">{CURRENCY_SYMBOL[currency]}</span>
                    <span className="font-medium">{currency}</span>
                  </span>
                </SelectTrigger>
                <SelectContent className="min-w-56">
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {/* A FIXED width, not w-full: SelectItemText is a bare,
                          content-sized span (Radix, not ours to style), so a
                          percentage width here would just resolve against its
                          own shrink-wrapped size and never reach the row's
                          actual right edge. */}
                      <span className="flex w-40 items-center justify-between gap-sm">
                        <span className="font-medium">{code}</span>
                        <span className="text-muted-foreground text-body-sm">{CURRENCY_LABEL[code]}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
