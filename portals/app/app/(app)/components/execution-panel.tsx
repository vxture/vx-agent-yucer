"use client";

import { useState } from "react";
import {
  DataTable,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useSaveAction } from "../lib/use-save-action";
import { SaveRow } from "./save-row";

// The work a campaign is made of.
//
// `campaign.execution.upsert` shipped in batch 1 with nothing behind it
// (TD-016), and this one was not merely unfinished - it was LOCKING something.
// `canCompleteCampaign` refuses to complete a campaign while any execution is
// outstanding, and nothing in the product could move an execution to done or
// skipped. A campaign with one pending item could never be completed, by
// anyone. Measured before this was built: camp_demo_1 (done/done/pending) was
// refused with `executions_outstanding`; camp_demo_3 (done) completed.
//
// The rows were already being read - campaignReturn loads them and summarised
// them into the "2/3 完成" figure the table above shows - and then threw them
// away, because there was nowhere for them to go.

function ExecutionStatusCell({
  status,
  labels,
}: {
  readonly status: string;
  readonly labels: Record<string, string>;
}) {
  // Only the two that still owe something get a badge. `done` and `skipped` are
  // settled, and a column of badges on settled rows hides the ones that block
  // the campaign.
  if (status === "pending" || status === "in_progress") {
    return <StatusBadge tone="warning">{labels[status] ?? status}</StatusBadge>;
  }
  return <span className="text-muted-foreground">{labels[status] ?? status}</span>;
}

export interface ExecutionRow {
  readonly id: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly campaignStatus: string;
  readonly title: string;
  readonly actionType: string;
  readonly assigneeSub: string | null;
  readonly dueAt: string | null;
  readonly status: string;
}

export interface ExecutionPanelProps {
  readonly rows: readonly ExecutionRow[];
  /** Only campaigns that are not complete - a finished one is frozen. */
  readonly campaigns: readonly { readonly id: string; readonly name: string }[];
  readonly canEdit: boolean;
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
  ) => Promise<{ ok: boolean; error?: string }>;
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

export function ExecutionPanel({ rows, campaigns, canEdit, onSave }: ExecutionPanelProps) {
  const { DATA_TABLE_LABELS, CAMPAIGN_TEXT, EXECUTION_ERROR } = useMessages();
  const [form, setForm] = useState(BLANK);
  const save = useSaveAction(EXECUTION_ERROR);

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

  const ready = form.campaignId !== "" && form.title.trim() !== "";

  return (
    <Section
      id="executions"
      icon="list-checks"
      title={CAMPAIGN_TEXT.executionsTitle}
      description={CAMPAIGN_TEXT.executionsWhy}
    >
      {rows.length === 0 ? (
        <EmptyState
          title={CAMPAIGN_TEXT.executionsNone}
          description={CAMPAIGN_TEXT.executionsNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: ExecutionRow) => r.id}
          rows={[...rows]}
          columns={executionColumns(CAMPAIGN_TEXT)}
        />
      )}

      {!canEdit ? (
        <p className="text-muted-foreground mt-sm text-xs">{CAMPAIGN_TEXT.executionsDenied}</p>
      ) : (
        <div className="mt-md flex flex-wrap items-end gap-sm">
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
          <SaveRow
            action={save}
            label={CAMPAIGN_TEXT.executionSave}
            savedLabel={CAMPAIGN_TEXT.executionSaved}
            disabled={!ready}
            onSave={() =>
              save.run(
                () =>
                  onSave(form.campaignId, {
                    id: form.id === "" ? null : form.id,
                    title: form.title.trim(),
                    actionType: form.actionType,
                    assigneeSub: form.assigneeSub.trim() === "" ? null : form.assigneeSub.trim(),
                    dueAt: form.dueAt === "" ? null : form.dueAt,
                    status: form.status,
                  }),
                () => setForm(BLANK),
              )
            }
          />
        </div>
      )}
      <p className="text-muted-foreground mt-sm text-xs">{CAMPAIGN_TEXT.executionBlocks}</p>
    </Section>
  );
}

/** Columns at module scope with the dictionary passed in - see milestone-panel. */
function executionColumns(text: {
  executionCampaign: string;
  executionTitle: string;
  executionType: string;
  executionAssignee: string;
  executionDue: string;
  executionStatus: string;
  executionTypeLabel: Record<string, string>;
  executionStatusLabel: Record<string, string>;
}) {
  return [
    { id: "campaign", header: text.executionCampaign, cell: (r: ExecutionRow) => r.campaignName },
    { id: "title", header: text.executionTitle, cell: (r: ExecutionRow) => r.title },
    {
      id: "type",
      header: text.executionType,
      cell: (r: ExecutionRow) => text.executionTypeLabel[r.actionType] ?? r.actionType,
    },
    {
      id: "assignee",
      header: text.executionAssignee,
      cell: (r: ExecutionRow) => r.assigneeSub ?? "",
    },
    { id: "due", header: text.executionDue, cell: (r: ExecutionRow) => r.dueAt ?? "" },
    {
      id: "status",
      header: text.executionStatus,
      align: "center" as const,
      cell: (r: ExecutionRow) => (
        <ExecutionStatusCell status={r.status} labels={text.executionStatusLabel} />
      ),
    },
  ];
}
