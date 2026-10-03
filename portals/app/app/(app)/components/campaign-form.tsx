"use client";

import { useMemo, useState } from "react";
import { Button, Field, FieldDescription, FieldLabel, Input, NativeSelect, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AssistPanel, FormFields, FormPage, useFormSubmit, type AssistSuggestion } from "./form-page";
import { suggestNextCode } from "../../domains/shared/suggest";

// 新建 / 修改战役 - a page, like the strategy plan form it is built after.
//
// There was no way to create a campaign: the header's 新建 opened the EXECUTION
// form, and the list's rows could only change status. A campaign is the anchor
// every lead and deal's attribution quotes, so it has to be creatable.
//
// NO STATUS FIELD in either mode: a new campaign is a draft and the lifecycle
// owns every move after that (including cancelling). THE NUMBER is editable only
// while it does not exist - it is the anchor and carries no UPDATE grant.

type Saved = { ok: boolean; error?: string };

export interface CampaignFormInitial {
  readonly id: string;
  readonly campaignNo: string;
  readonly name: string;
  readonly planId: string | null;
  readonly segmentId: string | null;
  readonly channel: string | null;
  readonly budgetAmount: number | null;
  readonly currency: string;
  readonly ownerSub: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

export interface CampaignFormInput {
  name: string;
  planId: string | null;
  segmentId: string | null;
  channel: string | null;
  budgetAmount: number | null;
  currency: string;
  ownerSub: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export function CampaignForm({
  existingNos,
  plans,
  segments,
  defaultCurrency,
  initial,
  onCreate,
  onSave,
}: {
  readonly existingNos: readonly string[];
  /** Plans that take new work, plus the one this campaign already hangs under. */
  readonly plans: readonly { id: string; name: string }[];
  readonly segments: readonly { id: string; name: string }[];
  readonly defaultCurrency: string;
  /** Present edits that campaign; absent creates one. */
  readonly initial?: CampaignFormInitial;
  readonly onCreate: (input: CampaignFormInput & { campaignNo: string }) => Promise<Saved>;
  readonly onSave: (id: string, input: CampaignFormInput) => Promise<Saved>;
}) {
  const { CAMPAIGN_TEXT, CAMPAIGN_FORM_ERROR, ASSIST_TEXT } = useMessages();
  const [campaignNo, setCampaignNo] = useState(initial?.campaignNo ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [planId, setPlanId] = useState(initial?.planId ?? "");
  const [segmentId, setSegmentId] = useState(initial?.segmentId ?? "");
  const [channel, setChannel] = useState(initial?.channel ?? "");
  const [budget, setBudget] = useState(initial?.budgetAmount == null ? "" : String(initial.budgetAmount));
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [ownerSub, setOwnerSub] = useState(initial?.ownerSub ?? "");
  const [startsAt, setStartsAt] = useState(initial?.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? "");
  const submit = useFormSubmit("/campaign");

  const nextNo = useMemo(() => suggestNextCode(existingNos), [existingNos]);
  const suggestions: AssistSuggestion[] = [];
  if (!initial && nextNo && campaignNo.trim() === "") {
    suggestions.push({
      id: "no",
      label: ASSIST_TEXT.codeNext(nextNo),
      reason: ASSIST_TEXT.codeNextWhy,
      apply: () => setCampaignNo(nextNo),
    });
  }

  const budgetValue = budget.trim() === "" ? null : Number(budget);
  const ready =
    name.trim() !== "" &&
    (initial ? true : campaignNo.trim() !== "") &&
    (budgetValue === null || Number.isFinite(budgetValue));

  return (
    <FormPage
      form={
        <Section icon="megaphone">
          <div className="gap-xl flex flex-col">
            <FormFields>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formNo}</FieldLabel>
                {initial ? (
                  <>
                    <p className="text-foreground mono text-body-md">{initial.campaignNo}</p>
                    <FieldDescription>{CAMPAIGN_TEXT.formNoFixed}</FieldDescription>
                  </>
                ) : (
                  <Input value={campaignNo} onChange={(e) => setCampaignNo(e.target.value)} />
                )}
              </Field>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formName}</FieldLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formPlan}</FieldLabel>
                <NativeSelect value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="">{CAMPAIGN_TEXT.formNone}</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formSegment}</FieldLabel>
                <NativeSelect value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                  <option value="">{CAMPAIGN_TEXT.formNone}</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formChannel}</FieldLabel>
                <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="">{CAMPAIGN_TEXT.formNone}</option>
                  {Object.entries(CAMPAIGN_TEXT.channelLabel).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                  {channel !== "" && !(channel in CAMPAIGN_TEXT.channelLabel) ? (
                    <option value={channel}>{channel}</option>
                  ) : null}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formOwner}</FieldLabel>
                <Input value={ownerSub} onChange={(e) => setOwnerSub(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formBudget}</FieldLabel>
                <Input type="number" min="0" step="any" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formCurrency}</FieldLabel>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formStarts}</FieldLabel>
                <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{CAMPAIGN_TEXT.formEnds}</FieldLabel>
                <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
            </FormFields>
            {initial ? null : <p className="text-muted-foreground text-body-sm">{CAMPAIGN_TEXT.formAnchor}</p>}
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(() => {
                    const fields: CampaignFormInput = {
                      name: name.trim(),
                      planId: planId === "" ? null : planId,
                      segmentId: segmentId === "" ? null : segmentId,
                      channel: channel === "" ? null : channel,
                      budgetAmount: budgetValue,
                      currency: currency.trim(),
                      ownerSub: ownerSub.trim() === "" ? null : ownerSub.trim(),
                      startsAt: startsAt === "" ? null : startsAt,
                      endsAt: endsAt === "" ? null : endsAt,
                    };
                    return initial ? onSave(initial.id, fields) : onCreate({ campaignNo: campaignNo.trim(), ...fields });
                  }, (c) => CAMPAIGN_FORM_ERROR[c] ?? CAMPAIGN_FORM_ERROR.denied)
                }
              >
                {initial ? CAMPAIGN_TEXT.formSave : CAMPAIGN_TEXT.formCreate}
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
