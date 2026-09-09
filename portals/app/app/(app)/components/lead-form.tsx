"use client";

import { useState } from "react";
import { Button, Field, FieldLabel, Input, NativeSelect, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { FormFields, FormPage, useFormSubmit } from "./form-page";

// 添加线索 - the hand-entered half of the funnel's mouth.
//
// FOUR FIELDS, AND ONLY ONE IS REQUIRED. A lead taken at a stand is a company
// name and not much else; demanding a contact or a customer match at the door
// would push people to type placeholders, and a placeholder in `account_id` is
// worse than a null - it points a deal at the wrong customer.
//
// NO OWNER FIELD, AND NO SCORE. Both are decisions this form is not the place
// for: who works it is 智能分配's question (by territory then load), and a
// score is the signal rule's arithmetic over a signal's type and age - this
// lead has no signal, so a number here would be invented.
//
// NO CAMPAIGN EITHER, and that one is a rule rather than a preference.
// `campaign_id` is a frozen attribution key (ADR-016): whatever is written
// here is what a future deal is credited to, forever. A hand-entered lead is
// self-sourced by definition, and offering the field would invite somebody to
// credit a campaign that did not produce it.

type Saved = { ok: boolean; error?: string };

export function LeadForm({
  accounts,
  onSave,
}: {
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
  readonly onSave: (input: {
    companyName: string;
    contactName: string | null;
    accountId: string | null;
  }) => Promise<Saved>;
}) {
  const { LEAD_TEXT, SIGNAL_ACTION_ERROR } = useMessages();
  const [form, setForm] = useState({ companyName: "", contactName: "", accountId: "" });
  const submit = useFormSubmit("/lead");

  const ready = form.companyName.trim() !== "";

  return (
    <FormPage
      form={
        <Section icon="target">
          <div className="gap-xl flex flex-col">
            <FormFields>
            <Field>
              <FieldLabel>{LEAD_TEXT.columnCompany}</FieldLabel>
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{LEAD_TEXT.formContact}</FieldLabel>
              <Input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{LEAD_TEXT.columnAccount}</FieldLabel>
              <NativeSelect
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              >
                <option value="">{LEAD_TEXT.formNoAccount}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
              {/* Said here because it is the consequence, not a nicety: an
                  unmatched lead has no region, so 智能分配 cannot place it,
                  and it cannot convert. Both are fixable later from the row's
                  own 匹配客户. */}
              <p className="text-muted-foreground text-body-sm">{LEAD_TEXT.formAccountWhy}</p>
            </Field>
            </FormFields>

            <p className="text-muted-foreground text-body-sm">{LEAD_TEXT.formOwnerNote}</p>

            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave({
                        companyName: form.companyName.trim(),
                        contactName: form.contactName.trim() === "" ? null : form.contactName.trim(),
                        accountId: form.accountId === "" ? null : form.accountId,
                      }),
                    (c) => SIGNAL_ACTION_ERROR[c] ?? SIGNAL_ACTION_ERROR.denied,
                  )
                }
              >
                {LEAD_TEXT.formSave}
              </Button>
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
          </div>
        </Section>
      }
    />
  );
}
