"use client";

import {
  Field,
  FieldDescription,
  FieldLabel,
  Icon,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@vxture/design-ui";
import { SUPPORTED_CURRENCIES, type PricingPolicy } from "../../domains/catalog/lib/pricing-policy";
import { useMessages } from "../lib/i18n/provider";
import { FormFields } from "./form-page";
import { Tag } from "./tag";

// 计价货币 - the currency this workspace prices in (incr/0044).
//
// WHY IT IS CONFIGURED AT ALL. "CNY" was in eleven places in the build - the
// line pricer, the pipeline's default, lead conversion, the price book's
// column, four pages' fallbacks. Eleven copies of one decision, none of them
// the workspace's. Every one of them reads this row now.
//
// ONE FIELD, deliberately. What else a pricing policy could hold - the floor
// discipline, a second currency with a rate - is a decision each, and a form
// that grew fields nobody had asked for would be inventing policy.
//
// CONTROLLED, AND NO FormActions OF ITS OWN (incr/0063). This used to own its
// own currency state and its own Save/Discard bar; both moved up to
// opportunity-config-panel.tsx - see that file's own header. No validator is
// exported here (unlike forecast/ageing): the field is a closed `<Select>`
// enum, so the control itself already guarantees a legal value.

export function PricingPolicyConfig({
  policy,
  canWrite,
  currency,
  onCurrencyChange,
  pending,
}: {
  readonly policy: PricingPolicy;
  readonly canWrite: boolean;
  readonly currency: string;
  readonly onCurrencyChange: (value: string) => void;
  readonly pending: boolean;
}) {
  const { CURRENCY_LABEL, CURRENCY_SYMBOL, PRICING_TEXT } = useMessages();

  return (
    <Section
      icon="scales"
      title={PRICING_TEXT.title}
      description={PRICING_TEXT.why}
      action={<Tag>{policy.defaultCurrency}</Tag>}
    >
      {/* INDENTED TO THE TITLE TEXT, not the icon - the same device
          vocabulary-config.tsx's own Section branch uses for 赢丢原因/商机
          类型/商机阶段: an invisible icon-sized spacer keeps this content
          column aligned with the title text, not the section's raw left
          edge, so every stacked block on this page reads at the same level. */}
      <div className="gap-lg flex">
        <span className="invisible shrink-0" aria-hidden="true">
          <Icon name="scales" size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <FormFields>
            <Field>
              <FieldLabel htmlFor="pricing-currency">{PRICING_TEXT.currencyLabel}</FieldLabel>
              {/* THE SYMBOL IS SPLIT OUT of the option rows (owner, 2026-09-12):
                  it lives only in the closed trigger, next to the code. Each
                  open-list row carries just the code and the muted, right-
                  aligned Chinese name - never the trigger's own chevron, since
                  that name never renders in the trigger at all. */}
              <Select value={currency} onValueChange={onCurrencyChange} disabled={pending || !canWrite}>
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
        </div>
      </div>
    </Section>
  );
}
