"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AssistPanel, FormPage, useFormSubmit, type AssistSuggestion } from "./form-page";
import { campaignsWithoutExecutions } from "../../domains/campaign/lib/suggest";
import { knownValues } from "../../domains/shared/suggest";

// 新建/编辑执行项 - a page since 2026-09-05 (owner ruling; one form per file,
// see plan-form.tsx for why the reachable-codes guard demands it).
//
// The stakes the inline panel documented survive the move: an outstanding
// execution BLOCKS its campaign's completion, so this form is where a stuck
// campaign gets unstuck.

type Saved = { ok: boolean; error?: string };

export interface ExecutionFormRow {
  readonly id: string;
  readonly campaignId: string;
  readonly campaignStatus: string;
  readonly title: string;
  readonly actionType: string;
  readonly assigneeSub: string | null;
  readonly dueAt: string | null;
  readonly status: string;
}

const BLANK = {
  id: "",
  campaignId: "",
  title: "",
  actionType: "outreach",
  assigneeSub: "",
  dueAt: "",
  status: "pending",
};

export function ExecutionForm({
  rows,
  campaigns,
  onSave,
}: {
  readonly rows: readonly ExecutionFormRow[];
  /** Campaigns that are not complete - a finished one is frozen. */
  readonly campaigns: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  }[];
  readonly onSave: (
    campaignId: string,
    input: {
      id: string | null;
      title: string;
      actionType: string;
      assigneeSub: string | null;
      dueAt: string | null;
      status: string;
    },
  ) => Promise<Saved>;
}) {
  const { CAMPAIGN_TEXT, EXECUTION_ERROR, ASSIST_TEXT } = useMessages();
  const [form, setForm] = useState(BLANK);
  const submit = useFormSubmit("/campaign");

  // Picking an existing item fills the form from it. A control that says
  // "editing X" and then writes whatever is in the fields is worse than no edit.
  function pick(id: string) {
    if (id === "") return setForm(BLANK);
    const e = rows.find((r) => r.id === id);
    if (!e) return setForm(BLANK);
    setForm({
      id: e.id,
      campaignId: e.campaignId,
      title: e.title,
      actionType: e.actionType,
      assigneeSub: e.assigneeSub ?? "",
      dueAt: e.dueAt ?? "",
      status: e.status,
    });
  }

  const empty = useMemo(
    () => campaignsWithoutExecutions(campaigns, rows),
    [campaigns, rows],
  );
  const assignees = useMemo(() => knownValues(rows.map((r) => r.assigneeSub)), [rows]);

  const suggestions: AssistSuggestion[] = [];
  // Running campaigns with no items yet: activity nobody has broken into work.
  for (const c of empty.slice(0, 2)) {
    if (form.campaignId === c.id) continue;
    suggestions.push({
      id: `camp-${c.id}`,
      label: ASSIST_TEXT.campaignEmpty(c.name),
      reason: ASSIST_TEXT.campaignEmptyWhy,
      apply: () => setForm((f) => ({ ...f, campaignId: c.id })),
    });
  }
  if (form.assigneeSub.trim() === "" && assignees.length > 0) {
    suggestions.push({
      id: "assignee",
      label: ASSIST_TEXT.assigneeKnown(assignees[0]!),
      reason: ASSIST_TEXT.assigneeKnownWhy,
      apply: () => setForm((f) => ({ ...f, assigneeSub: assignees[0]! })),
    });
  }

  const ready = form.campaignId !== "" && form.title.trim() !== "";
  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - see plan-form.tsx.
        <Section icon="list-checks">
          <div className="flex max-w-xl flex-col gap-md">
            <Field>
              <FieldLabel>{CAMPAIGN_TEXT.executionEditing}</FieldLabel>
              <NativeSelect value={form.id} onChange={(e) => pick(e.target.value)}>
                <option value="">{CAMPAIGN_TEXT.executionNew}</option>
                {rows
                  .filter((r) => r.campaignStatus !== "completed")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>{CAMPAIGN_TEXT.executionCampaign}</FieldLabel>
              <NativeSelect
                value={form.campaignId}
                onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
              >
                <option value="">{CAMPAIGN_TEXT.executionPickCampaign}</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>{CAMPAIGN_TEXT.executionTitle}</FieldLabel>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>{CAMPAIGN_TEXT.executionType}</FieldLabel>
              <NativeSelect
                value={form.actionType}
                onChange={(e) => setForm({ ...form, actionType: e.target.value })}
              >
                {Object.entries(CAMPAIGN_TEXT.executionTypeLabel).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>{CAMPAIGN_TEXT.executionAssignee}</FieldLabel>
              <Input
                value={form.assigneeSub}
                onChange={(e) => setForm({ ...form, assigneeSub: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{CAMPAIGN_TEXT.executionDue}</FieldLabel>
              <Input
                type="date"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{CAMPAIGN_TEXT.executionStatus}</FieldLabel>
              <NativeSelect
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {Object.entries(CAMPAIGN_TEXT.executionStatusLabel).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <p className="text-muted-foreground text-body-sm">{CAMPAIGN_TEXT.executionBlocks}</p>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave(form.campaignId, {
                        id: form.id === "" ? null : form.id,
                        title: form.title.trim(),
                        actionType: form.actionType,
                        assigneeSub: form.assigneeSub.trim() === "" ? null : form.assigneeSub.trim(),
                        dueAt: form.dueAt === "" ? null : form.dueAt,
                        status: form.status,
                      }),
                    (c) => EXECUTION_ERROR[c] ?? EXECUTION_ERROR.denied,
                  )
                }
              >
                {CAMPAIGN_TEXT.executionSave}
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
