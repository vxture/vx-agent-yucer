"use client";

import { useState } from "react";
import { Button, Field, FieldLabel, Input, NativeSelect, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { FormFields, FormPage, useFormSubmit } from "./form-page";

// 新增回款期次 - a page, like the milestone and project forms.
//
// The collection page could only MOVE instalments that already existed, so a
// plan could not be started from the product. NO STATUS field: a new instalment
// is a plan, and the collection page owns every move after that. It names the
// MILESTONE that releases it - every instalment does (incr/0032) - chosen from
// the selected project's own plan.

type Saved = { ok: boolean; error?: string };

export function InstalmentForm({
  projects,
  milestones,
  initialProjectId,
  onCreate,
}: {
  readonly projects: readonly { id: string; name: string; currency: string }[];
  readonly milestones: readonly { id: string; projectId: string; name: string; sequence: number }[];
  readonly initialProjectId?: string;
  readonly onCreate: (input: {
    projectId: string;
    milestoneId: string;
    plannedAmount: number;
    currency: string;
    dueAt: string | null;
  }) => Promise<Saved>;
}) {
  const { DELIVERY_TEXT, INSTALMENT_FORM_ERROR } = useMessages();
  const preset = projects.find((p) => p.id === initialProjectId);
  const [projectId, setProjectId] = useState(preset?.id ?? "");
  const [milestoneId, setMilestoneId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(preset?.currency ?? "");
  const [dueAt, setDueAt] = useState("");
  const submit = useFormSubmit("/collection");

  const gates = milestones.filter((m) => m.projectId === projectId);
  const amountValue = Number(amount);
  const ready = projectId !== "" && milestoneId !== "" && Number.isFinite(amountValue) && amountValue > 0 && currency.trim() !== "";

  return (
    <FormPage
      form={
        <Section icon="coins">
          <div className="gap-xl flex flex-col">
            <FormFields>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.instalmentProject}</FieldLabel>
                <NativeSelect
                  value={projectId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setProjectId(id);
                    setMilestoneId("");
                    setCurrency(projects.find((p) => p.id === id)?.currency ?? "");
                  }}
                >
                  <option value="">{DELIVERY_TEXT.instalmentPickProject}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.instalmentGate}</FieldLabel>
                <NativeSelect value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} disabled={projectId === ""}>
                  <option value="">{DELIVERY_TEXT.instalmentPickGate}</option>
                  {gates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.sequence}. {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.instalmentAmount}</FieldLabel>
                <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.formCurrency}</FieldLabel>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>{DELIVERY_TEXT.instalmentDue}</FieldLabel>
                <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </Field>
            </FormFields>
            <p className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.instalmentHint}</p>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () => onCreate({ projectId, milestoneId, plannedAmount: amountValue, currency: currency.trim(), dueAt: dueAt === "" ? null : dueAt }),
                    (c) => INSTALMENT_FORM_ERROR[c] ?? INSTALMENT_FORM_ERROR.denied,
                  )
                }
              >
                {DELIVERY_TEXT.instalmentCreate}
              </Button>
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
          </div>
        </Section>
      }
    />
  );
}
