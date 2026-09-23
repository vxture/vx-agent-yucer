"use client";

import { Field, FieldLabel, Input, NativeSelect } from "@vxture/design-ui";
import { ALL_PROVINCES } from "../../domains/shared/provinces";
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

export interface AccountFieldValues {
  name: string;
  region: string;
  province: string;
  industryId: string;
  segmentCode: string;
  customerTypeId: string;
  customerSizeId: string;
  customerNatureId: string;
  creditCode: string;
  website: string;
  employeeCount: string;
}

export interface AccountFieldVocab {
  readonly industries: readonly VocabOption[];
  /** id = segmentCode itself - account.segment_code stores the code. */
  readonly segments: readonly VocabOption[];
  readonly customerTypes: readonly VocabOption[];
  readonly customerSizes: readonly VocabOption[];
  readonly customerNatures: readonly VocabOption[];
}

export interface AccountPatchShape {
  name: string;
  region: string | null;
  province: string | null;
  industryId: string | null;
  segmentCode: string | null;
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
    segmentCode: blank(r.segmentCode as string | null),
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
    segmentCode: nullIfBlank(v.segmentCode),
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
  const { ACCOUNT_BASICS_TEXT } = useMessages();
  const set = (k: keyof AccountFieldValues) => (value: string) => onChange({ ...values, [k]: value });
  const select = (
    k: keyof AccountFieldValues,
    label: string,
    pick: string,
    options: readonly VocabOption[],
  ) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <NativeSelect value={values[k]} onChange={(ev) => set(k)(ev.target.value)} disabled={pending}>
        <option value="">{pick}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </NativeSelect>
    </Field>
  );

  return (
    <>
      <Field>
        <FieldLabel>{ACCOUNT_BASICS_TEXT.name}</FieldLabel>
        <Input value={values.name} onChange={(ev) => set("name")(ev.target.value)} disabled={pending} />
      </Field>

      {/* 只读派生标识 - 系统生成, 不能改. On create it does not exist yet. */}
      <Field>
        <FieldLabel>{ACCOUNT_BASICS_TEXT.accountNo}</FieldLabel>
        <Input value={accountNo ?? ACCOUNT_BASICS_TEXT.accountNoOnSave} disabled />
      </Field>

      <Field>
        <FieldLabel>{ACCOUNT_BASICS_TEXT.region}</FieldLabel>
        <Input value={values.region} onChange={(ev) => set("region")(ev.target.value)} disabled={pending} />
      </Field>

      {select(
        "province",
        ACCOUNT_BASICS_TEXT.province,
        ACCOUNT_BASICS_TEXT.provincePick,
        ALL_PROVINCES.map((p) => ({ id: p, name: p })),
      )}
      {select("industryId", ACCOUNT_BASICS_TEXT.industry, ACCOUNT_BASICS_TEXT.industryPick, vocab.industries)}
      {vocab.segments.length > 0
        ? select("segmentCode", ACCOUNT_BASICS_TEXT.segment, ACCOUNT_BASICS_TEXT.segmentPick, vocab.segments)
        : null}
      {select("customerTypeId", ACCOUNT_BASICS_TEXT.customerType, ACCOUNT_BASICS_TEXT.customerTypePick, vocab.customerTypes)}
      {select("customerSizeId", ACCOUNT_BASICS_TEXT.customerSize, ACCOUNT_BASICS_TEXT.customerSizePick, vocab.customerSizes)}
      {select(
        "customerNatureId",
        ACCOUNT_BASICS_TEXT.customerNature,
        ACCOUNT_BASICS_TEXT.customerNaturePick,
        vocab.customerNatures,
      )}

      <Field>
        <FieldLabel>{ACCOUNT_BASICS_TEXT.creditCode}</FieldLabel>
        <Input value={values.creditCode} onChange={(ev) => set("creditCode")(ev.target.value)} disabled={pending} />
      </Field>

      <Field>
        <FieldLabel>{ACCOUNT_BASICS_TEXT.website}</FieldLabel>
        <Input value={values.website} onChange={(ev) => set("website")(ev.target.value)} disabled={pending} />
      </Field>

      <Field>
        <FieldLabel>{ACCOUNT_BASICS_TEXT.employeeCount}</FieldLabel>
        <Input
          type="number"
          min="0"
          value={values.employeeCount}
          onChange={(ev) => set("employeeCount")(ev.target.value)}
          disabled={pending}
        />
      </Field>
    </>
  );
}
