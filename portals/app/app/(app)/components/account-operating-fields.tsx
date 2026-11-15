"use client";

import { FormFields } from "./form-page";
import { useId } from "react";
import { Checkbox, Field, FieldLabel, Input, NativeSelect } from "@vxture/design-ui";
import type { AccountTier } from "../../domains/account/store";
import type { OperatingValues } from "../lib/account-plan-form";
import { useMessages } from "../lib/i18n/provider";

/** Shared domain fields bound to DS controls, with no separate create form. */
export function AccountOperatingFields({ tier, values, onChange, onTierChange, disabled = false }: {
  readonly tier: AccountTier;
  readonly values: OperatingValues;
  readonly onChange: (values: OperatingValues) => void;
  readonly onTierChange?: (tier: AccountTier) => void;
  readonly disabled?: boolean;
}) {
  const { ACCOUNT_OPERATING_TEXT: text, POSITION_TEXT } = useMessages();
  const id = useId();
  const strategic = tier === "strategic";
  const showPlan = strategic || values.enabled;
  const field = (key: "period" | "targetAmount" | "contactCadenceDays" | "execCadenceDays", label: string, required: boolean) => (
    <Field key={key}>
      <FieldLabel htmlFor={`${id}-${key}`} required={required}>{label}</FieldLabel>
      <Input
        id={`${id}-${key}`}
        type={key === "period" ? "text" : "number"}
        maxLength={key === "period" ? 16 : undefined}
        min={key === "targetAmount" ? 0 : key === "period" ? undefined : 1}
        step={key === "targetAmount" ? "0.01" : key === "period" ? undefined : 1}
        required={required}
        value={values[key]}
        disabled={disabled}
        onChange={(ev) => onChange({ ...values, [key]: ev.target.value })}
      />
    </Field>
  );
  return (
    <section className="flex flex-col gap-md" aria-labelledby={`${id}-operating`}>
      <h2 id={`${id}-operating`} className="text-label-medium">{text.title}</h2>
      <FormFields>
        {onTierChange ? <Field>
          <FieldLabel htmlFor={`${id}-tier`}>{text.tier}</FieldLabel>
          <NativeSelect id={`${id}-tier`} value={tier} disabled={disabled} onChange={ev => onTierChange(ev.target.value as AccountTier)}>
            <option value="standard">{POSITION_TEXT.tierStandard}</option>
            <option value="key">{POSITION_TEXT.tierKey}</option>
            <option value="strategic">{POSITION_TEXT.tierStrategic}</option>
          </NativeSelect>
        </Field> : null}
        {showPlan ? field("period", POSITION_TEXT.planPeriod, strategic) : null}
        {showPlan ? field("targetAmount", POSITION_TEXT.planTarget, strategic) : null}
        {showPlan ? field("contactCadenceDays", POSITION_TEXT.cadenceContact, strategic) : null}
        {showPlan ? field("execCadenceDays", POSITION_TEXT.cadenceExec, strategic) : null}
      </FormFields>
      {!strategic ? (
        <Field orientation="horizontal">
          <Checkbox id={`${id}-enabled`} checked={values.enabled} disabled={disabled} onCheckedChange={checked => onChange({ ...values, enabled: checked === true })} />
          <FieldLabel htmlFor={`${id}-enabled`}>{text.enable}</FieldLabel>
        </Field>
      ) : null}
    </section>
  );
}
