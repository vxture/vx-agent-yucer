"use client";

import { Field, FieldDescription, FieldLabel, Icon, Input, Section } from "@vxture/design-ui";
import type { Dispatch, SetStateAction } from "react";
import type { ContactRecencyPolicy } from "../../domains/account/lib/contact-recency-policy";
import { useMessages } from "../lib/i18n/provider";
import { FormFields } from "./form-page";
import { Tag } from "./tag";

// 联系提醒阈值 - how many days of silence count as quiet, stale, or cold
// (incr/0065).
//
// THREE FIELDS, ONE SECTION, FOR THE SAME REASON forecast-threshold-config.tsx
// HOLDS TWO BANDS PLUS A STALL FIELD: they are one workspace decision made in
// one sitting, even though quietDays/staleDays drive the home feed and
// chainWarmDays drives a completely different rule (decision-chain warmth).
//
// CONTROLLED, AND NO FormActions OF ITS OWN - this section lives on
// /admin/reminder inside ReminderConfigPanel, which owns the form state and
// the one shared save bar, the same split opportunity-config-panel.tsx uses
// for its three sections. `firstContactRecencyError` is exported so the
// panel's aggregate save can validate this section without duplicating the
// rule.

export type ContactRecencyForm = { quietDays: string; staleDays: string; chainWarmDays: string };

export function firstContactRecencyError(quietDays: number, staleDays: number, chainWarmDays: number) {
  if (!(Number.isInteger(quietDays) && quietDays >= 1 && quietDays <= 365)) return "quiet_out_of_range";
  if (!(Number.isInteger(staleDays) && staleDays >= 1 && staleDays <= 365)) return "stale_out_of_range";
  if (quietDays >= staleDays) return "recency_bands_cross";
  if (!(Number.isInteger(chainWarmDays) && chainWarmDays >= 1 && chainWarmDays <= 365)) {
    return "chain_warm_out_of_range";
  }
  return null;
}

export function ContactRecencyConfig({
  policy,
  canWrite,
  form,
  onFormChange,
  pending,
}: {
  readonly policy: ContactRecencyPolicy;
  readonly canWrite: boolean;
  readonly form: ContactRecencyForm;
  readonly onFormChange: Dispatch<SetStateAction<ContactRecencyForm>>;
  readonly pending: boolean;
}) {
  const { CONTACT_RECENCY_TEXT } = useMessages();

  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  const parsed = {
    quietDays: num(form.quietDays),
    staleDays: num(form.staleDays),
    chainWarmDays: num(form.chainWarmDays),
  };
  const quietInvalid = !(Number.isInteger(parsed.quietDays) && parsed.quietDays >= 1 && parsed.quietDays <= 365);
  const staleInvalid =
    !(Number.isInteger(parsed.staleDays) && parsed.staleDays >= 1 && parsed.staleDays <= 365) ||
    (!quietInvalid && parsed.staleDays <= parsed.quietDays);
  const chainWarmInvalid = !(
    Number.isInteger(parsed.chainWarmDays) &&
    parsed.chainWarmDays >= 1 &&
    parsed.chainWarmDays <= 365
  );

  return (
    <Section
      icon="timer"
      title={CONTACT_RECENCY_TEXT.title}
      description={CONTACT_RECENCY_TEXT.why}
      action={<Tag>{policy.quietDays}/{policy.staleDays}/{policy.chainWarmDays} {CONTACT_RECENCY_TEXT.days}</Tag>}
    >
      {/* INDENTED TO THE TITLE TEXT, not the icon - same device as
          forecast-threshold-config.tsx / pricing-policy-config.tsx. */}
      <div className="gap-lg flex">
        <span className="invisible shrink-0" aria-hidden="true">
          <Icon name="timer" size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <FormFields>
            <Field>
              <FieldLabel htmlFor="cr-quiet">{CONTACT_RECENCY_TEXT.quietLabel}</FieldLabel>
              <div className="gap-sm flex items-center">
                <Input
                  id="cr-quiet"
                  type="number"
                  inputMode="numeric"
                  className="max-w-[8rem]"
                  value={form.quietDays}
                  disabled={pending || !canWrite}
                  aria-invalid={quietInvalid}
                  onChange={(e) => onFormChange((f) => ({ ...f, quietDays: e.target.value }))}
                />
                <span className="text-body-sm text-muted-foreground">{CONTACT_RECENCY_TEXT.days}</span>
              </div>
              <FieldDescription>{CONTACT_RECENCY_TEXT.quietHint}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="cr-stale">{CONTACT_RECENCY_TEXT.staleLabel}</FieldLabel>
              <div className="gap-sm flex items-center">
                <Input
                  id="cr-stale"
                  type="number"
                  inputMode="numeric"
                  className="max-w-[8rem]"
                  value={form.staleDays}
                  disabled={pending || !canWrite}
                  aria-invalid={staleInvalid}
                  onChange={(e) => onFormChange((f) => ({ ...f, staleDays: e.target.value }))}
                />
                <span className="text-body-sm text-muted-foreground">{CONTACT_RECENCY_TEXT.days}</span>
              </div>
              <FieldDescription>{CONTACT_RECENCY_TEXT.staleHint}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="cr-chain-warm">{CONTACT_RECENCY_TEXT.chainWarmLabel}</FieldLabel>
              <div className="gap-sm flex items-center">
                <Input
                  id="cr-chain-warm"
                  type="number"
                  inputMode="numeric"
                  className="max-w-[8rem]"
                  value={form.chainWarmDays}
                  disabled={pending || !canWrite}
                  aria-invalid={chainWarmInvalid}
                  onChange={(e) => onFormChange((f) => ({ ...f, chainWarmDays: e.target.value }))}
                />
                <span className="text-body-sm text-muted-foreground">{CONTACT_RECENCY_TEXT.days}</span>
              </div>
              <FieldDescription>{CONTACT_RECENCY_TEXT.chainWarmHint}</FieldDescription>
            </Field>
          </FormFields>
        </div>
      </div>
    </Section>
  );
}
