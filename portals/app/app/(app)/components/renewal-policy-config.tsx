"use client";

import { Field, FieldDescription, FieldLabel, Icon, Input, Section } from "@vxture/design-ui";
import type { RenewalPolicy } from "../../domains/delivery/lib/renewal";
import { useMessages } from "../lib/i18n/provider";
import { FormFields } from "./form-page";
import { Tag } from "./tag";

// 续约提醒窗口 - how many days ahead a subscription renewal surfaces
// (incr/0066).
//
// CONTROLLED, ONE FIELD, NO FormActions OF ITS OWN - lives on /admin/reminder
// inside ReminderConfigPanel, which owns the shared save bar. No validator
// export needed beyond the inline range check: a single bounded integer field
// has nothing else to cross-check against.

export function firstRenewalPolicyError(windowDays: number) {
  if (!(Number.isInteger(windowDays) && windowDays >= 1 && windowDays <= 365)) return "window_out_of_range";
  return null;
}

export function RenewalPolicyConfig({
  policy,
  canWrite,
  windowDays,
  onWindowDaysChange,
  pending,
}: {
  readonly policy: RenewalPolicy;
  readonly canWrite: boolean;
  readonly windowDays: string;
  readonly onWindowDaysChange: (value: string) => void;
  readonly pending: boolean;
}) {
  const { RENEWAL_POLICY_TEXT } = useMessages();

  const parsed = windowDays.trim() === "" ? Number.NaN : Number(windowDays);
  const invalid = !(Number.isInteger(parsed) && parsed >= 1 && parsed <= 365);

  return (
    <Section
      icon="refresh"
      title={RENEWAL_POLICY_TEXT.title}
      description={RENEWAL_POLICY_TEXT.why}
      action={<Tag>{policy.windowDays} {RENEWAL_POLICY_TEXT.days}</Tag>}
    >
      {/* INDENTED TO THE TITLE TEXT, not the icon - same device as the other
          /admin/reminder sections. */}
      <div className="gap-lg flex">
        <span className="invisible shrink-0" aria-hidden="true">
          <Icon name="refresh" size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <FormFields>
            <Field>
              <FieldLabel htmlFor="renewal-window">{RENEWAL_POLICY_TEXT.windowLabel}</FieldLabel>
              <div className="gap-sm flex items-center">
                <Input
                  id="renewal-window"
                  type="number"
                  inputMode="numeric"
                  className="max-w-[8rem]"
                  value={windowDays}
                  disabled={pending || !canWrite}
                  aria-invalid={invalid}
                  onChange={(e) => onWindowDaysChange(e.target.value)}
                />
                <span className="text-body-sm text-muted-foreground">{RENEWAL_POLICY_TEXT.days}</span>
              </div>
              <FieldDescription>{RENEWAL_POLICY_TEXT.windowHint}</FieldDescription>
            </Field>
          </FormFields>
        </div>
      </div>
    </Section>
  );
}
