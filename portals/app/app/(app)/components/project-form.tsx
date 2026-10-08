"use client";

import { useMemo, useState } from "react";
import { Button, Field, FieldDescription, FieldLabel, Input, NativeSelect, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AssistPanel, FormFields, FormPage, useFormSubmit, type AssistSuggestion } from "./form-page";
import { suggestNextCode } from "../../domains/shared/suggest";

// 新建 / 修改项目 - a page, like the campaign and plan forms.
//
// A project could not be created in the product, only read. NO STATUS and NO
// HEALTH field in either mode: it starts in planning, reported healthy, and the
// reconcile and the cancel verb own every move after that. THE NUMBER, THE
// CUSTOMER AND THE DEAL are chosen once: they are the project's identity and
// carry no UPDATE grant.

type Saved = { ok: boolean; error?: string };

export interface ProjectFormInitial {
  readonly id: string;
  readonly projectNo: string;
  readonly name: string;
  readonly accountName: string;
  readonly managerSub: string | null;
  readonly contractAmount: number | null;
  readonly currency: string;
  readonly endsAt: string | null;
  readonly engagementType: string;
}

export interface ProjectFormFields {
  name: string;
  managerSub: string | null;
  contractAmount: number | null;
  currency: string;
  endsAt: string | null;
  engagementType: string;
}

export function ProjectForm({
  existingNos,
  accounts,
  deals,
  defaultCurrency,
  initial,
  presetAccountId,
  onCreate,
  onSave,
}: {
  readonly existingNos: readonly string[];
  readonly accounts: readonly { id: string; name: string }[];
  readonly deals: readonly { id: string; name: string; accountId: string }[];
  readonly defaultCurrency: string;
  readonly initial?: ProjectFormInitial;
  readonly presetAccountId?: string;
  readonly onCreate: (input: ProjectFormFields & { projectNo: string; accountId: string; opportunityId: string | null }) => Promise<Saved>;
  readonly onSave: (id: string, input: ProjectFormFields) => Promise<Saved>;
}) {
  const { DELIVERY_TEXT, PROJECT_FORM_ERROR, ASSIST_TEXT } = useMessages();
  const [projectNo, setProjectNo] = useState(initial?.projectNo ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [accountId, setAccountId] = useState(presetAccountId ?? "");
  const [opportunityId, setOpportunityId] = useState("");
  const [managerSub, setManagerSub] = useState(initial?.managerSub ?? "");
  const [amount, setAmount] = useState(initial?.contractAmount == null ? "" : String(initial.contractAmount));
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? "");
  const [engagement, setEngagement] = useState(initial?.engagementType ?? "one_off");
  const submit = useFormSubmit("/delivery");

  const nextNo = useMemo(() => suggestNextCode(existingNos), [existingNos]);
  const suggestions: AssistSuggestion[] = [];
  if (!initial && nextNo && projectNo.trim() === "") {
    suggestions.push({
      id: "no",
      label: ASSIST_TEXT.codeNext(nextNo),
      reason: ASSIST_TEXT.codeNextWhy,
      apply: () => setProjectNo(nextNo),
    });
  }

  const amountValue = amount.trim() === "" ? null : Number(amount);
  const dealsOfAccount = deals.filter((d) => d.accountId === accountId);
  const ready =
    name.trim() !== "" &&
    (initial ? true : projectNo.trim() !== "" && accountId !== "") &&
    (amountValue === null || Number.isFinite(amountValue));

  return (
    <FormPage
      form={
        <Section icon="package">
          <div className="gap-xl flex flex-col">
            <FormFields>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.formProjectNo}</FieldLabel>
                {initial ? (
                  <>
                    <p className="text-foreground mono text-body">{initial.projectNo}</p>
                    <FieldDescription>{DELIVERY_TEXT.formProjectNoFixed}</FieldDescription>
                  </>
                ) : (
                  <Input value={projectNo} onChange={(e) => setProjectNo(e.target.value)} />
                )}
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.formProjectName}</FieldLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.formAccount}</FieldLabel>
                {initial ? (
                  <p className="text-foreground text-body">{initial.accountName}</p>
                ) : (
                  <NativeSelect
                    value={accountId}
                    onChange={(e) => {
                      setAccountId(e.target.value);
                      setOpportunityId("");
                    }}
                  >
                    <option value="">{DELIVERY_TEXT.formPickAccount}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              {initial ? null : (
                <Field>
                  <FieldLabel>{DELIVERY_TEXT.formDeal}</FieldLabel>
                  <NativeSelect value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} disabled={accountId === ""}>
                    <option value="">{DELIVERY_TEXT.formNone}</option>
                    {dealsOfAccount.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              <Field>
                <FieldLabel>{DELIVERY_TEXT.formManager}</FieldLabel>
                <Input value={managerSub} onChange={(e) => setManagerSub(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.formAmount}</FieldLabel>
                <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.formCurrency}</FieldLabel>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.formEnds}</FieldLabel>
                <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.formEngagement}</FieldLabel>
                <NativeSelect value={engagement} onChange={(e) => setEngagement(e.target.value)}>
                  <option value="one_off">{DELIVERY_TEXT.engagementOneOff}</option>
                  <option value="subscription">{DELIVERY_TEXT.engagementSubscription}</option>
                </NativeSelect>
              </Field>
            </FormFields>
            {initial ? null : <p className="text-muted-foreground text-body-small">{DELIVERY_TEXT.projectAnchor}</p>}
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(() => {
                    const fields: ProjectFormFields = {
                      name: name.trim(),
                      managerSub: managerSub.trim() === "" ? null : managerSub.trim(),
                      contractAmount: amountValue,
                      currency: currency.trim(),
                      endsAt: endsAt === "" ? null : endsAt,
                      engagementType: engagement,
                    };
                    return initial
                      ? onSave(initial.id, fields)
                      : onCreate({ projectNo: projectNo.trim(), accountId, opportunityId: opportunityId === "" ? null : opportunityId, ...fields });
                  }, (c) => PROJECT_FORM_ERROR[c] ?? PROJECT_FORM_ERROR.denied)
                }
              >
                {initial ? DELIVERY_TEXT.projectSave : DELIVERY_TEXT.projectCreate}
              </Button>
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
          </div>
        </Section>
      }
      assist={<AssistPanel suggestions={suggestions} />}
    />
  );
}
