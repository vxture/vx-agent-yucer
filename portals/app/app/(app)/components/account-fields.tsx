"use client";

import { useId } from "react";
import { Field, FieldDescription, FieldLabel, Input, NativeSelect, Separator } from "@vxture/design-ui";
import type { RegistrationValues, RegistrationVocab } from "../../domains/account/lib/registration-draft";
import { ALL_PROVINCES } from "../../domains/shared/provinces";
import { FormFields } from "./form-page";
import { useMessages } from "../lib/i18n/provider";

// 客户资料的字段区 - ONE block, two forms: the 客户总编辑 drawer (edit) and
// /account/new (create, owner 2026-09-23: 独立页面全字段表单). Extracted so a
// field added to the record is added to both, not to whichever form the
// author remembered.
//
// Values are strings throughout ("" = unset, the <select>/<input> convention)
// and converted to the record's nullable shape only by toAccountPatch().

export interface VocabOption {
  readonly id: string;
  readonly name: string;
}

export type AccountFieldValues = RegistrationValues;
export type AccountFieldVocab = RegistrationVocab;

export interface AccountPatchShape {
  name: string;
  region: string | null;
  province: string | null;
  industryId: string | null;
  segmentId: string | null;
  customerTypeId: string | null;
  customerSizeId: string | null;
  customerNatureId: string | null;
  creditCode: string | null;
  website: string | null;
  employeeCount: number | null;
}

const blank = (v: string | null | undefined) => v ?? "";
const nullIfBlank = (v: string) => (v.trim() === "" ? null : v.trim());

export function toAccountFieldValues(r: Partial<Record<keyof AccountPatchShape, unknown>> = {}): AccountFieldValues {
  return {
    name: blank(r.name as string | null),
    region: blank(r.region as string | null),
    province: blank(r.province as string | null),
    industryId: blank(r.industryId as string | null),
    segmentId: blank(r.segmentId as string | null),
    customerTypeId: blank(r.customerTypeId as string | null),
    customerSizeId: blank(r.customerSizeId as string | null),
    customerNatureId: blank(r.customerNatureId as string | null),
    creditCode: blank(r.creditCode as string | null),
    website: blank(r.website as string | null),
    employeeCount: r.employeeCount != null ? String(r.employeeCount) : "",
  };
}

export function toAccountPatch(v: AccountFieldValues): AccountPatchShape {
  return {
    name: v.name,
    region: nullIfBlank(v.region),
    province: nullIfBlank(v.province),
    industryId: nullIfBlank(v.industryId),
    segmentId: nullIfBlank(v.segmentId),
    customerTypeId: nullIfBlank(v.customerTypeId),
    customerSizeId: nullIfBlank(v.customerSizeId),
    customerNatureId: nullIfBlank(v.customerNatureId),
    creditCode: nullIfBlank(v.creditCode),
    website: nullIfBlank(v.website),
    employeeCount: v.employeeCount.trim() === "" ? null : Number(v.employeeCount),
  };
}

export function AccountFields({
  values,
  onChange,
  vocab,
  pending,
  accountNo,
}: {
  readonly values: AccountFieldValues;
  readonly onChange: (next: AccountFieldValues) => void;
  readonly vocab: AccountFieldVocab;
  readonly pending: boolean;
  /** The existing number (edit), or null on create - where it is assigned on save. */
  readonly accountNo: string | null;
}) {
  const { ACCOUNT_BASICS_TEXT: T } = useMessages();
  const id = useId();
  const set = (key: keyof AccountFieldValues, value: string) => onChange({ ...values, [key]: value });
  const input = (key: keyof AccountFieldValues, label: string, props: { required?: boolean; type?: string; min?: number } = {}) => (
    <Field>
      <FieldLabel htmlFor={`${id}-${key}`} required={props.required}>{label}</FieldLabel>
      <Input id={`${id}-${key}`} {...props} value={values[key]} onChange={e => set(key, e.target.value)} disabled={pending} />
    </Field>
  );
  const select = (key: keyof AccountFieldValues, label: string, pick: string, options: readonly VocabOption[]) => (
    <Field>
      <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
      <NativeSelect id={`${id}-${key}`} value={values[key]} onChange={e => set(key, e.target.value)} disabled={pending}>
        <option value="">{pick}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </NativeSelect>
    </Field>
  );

  return <div className="flex flex-col gap-lg" data-business-form data-account-fields>
    <section className="flex flex-col gap-md" aria-labelledby={`${id}-identity`}>
      <h2 id={`${id}-identity`} className="text-label-medium">{T.identityGroup}</h2>
      <FormFields>
        {input("name", T.name, { required: true })}
        {input("creditCode", T.creditCode)}
        {input("website", T.website)}
        {accountNo !== null ? <Field>
          <FieldLabel htmlFor={`${id}-number`}>{T.accountNo}</FieldLabel>
          <Input id={`${id}-number`} value={accountNo} readOnly />
        </Field> : null}
      </FormFields>
    </section>
    <Separator />
    <section className="flex flex-col gap-md" aria-labelledby={`${id}-positioning`}>
      <h2 id={`${id}-positioning`} className="text-label-medium">{T.positionGroup}</h2>
      <FormFields>
        {select("industryId", T.industry, T.industryPick, vocab.industries)}
        {select("segmentId", T.segment, T.segmentPick, vocab.segments)}
        {select("customerTypeId", T.customerType, T.customerTypePick, vocab.customerTypes)}
        {select("customerNatureId", T.customerNature, T.customerNaturePick, vocab.customerNatures)}
        {select("customerSizeId", T.customerSize, T.customerSizePick, vocab.customerSizes)}
        {input("employeeCount", T.employeeCount, { type: "number", min: 0 })}
      </FormFields>
    </section>
    <Separator />
    <section className="flex flex-col gap-md" aria-labelledby={`${id}-location`}>
      <h2 id={`${id}-location`} className="text-label-medium">{T.locationGroup}</h2>
      <FormFields>
        <Field>
          <FieldLabel htmlFor={`${id}-region`}>{T.region}</FieldLabel>
          <NativeSelect id={`${id}-region`} value={values.region} onChange={e => set("region", e.target.value)} disabled={pending}>
            <option value="">{T.regionPick}</option>
            {values.region && !vocab.regions.some(r => r.id === values.region)
              ? <option value={values.region}>{T.regionLegacy(values.region)}</option> : null}
            {vocab.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
          {vocab.regions.length === 0 ? <FieldDescription>{T.regionNone}</FieldDescription> : null}
        </Field>
        {select("province", T.province, T.provincePick, ALL_PROVINCES.map(p => ({ id: p, name: p })))}
      </FormFields>
    </section>
  </div>;
}
