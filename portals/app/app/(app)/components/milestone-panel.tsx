"use client";

import { useState, useTransition } from "react";
import {
  Button,
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

// The delivery plan, across projects.
//
// `projectView` has always returned the milestones and nothing rendered them -
// the same state the instalments were in before 6a-3b - while
// `delivery.milestone.upsert` sat in the action catalogue with no verb behind
// it (TD-016). So a delivery plan could only ever be what db-init put there.
//
// IT DECIDES A VERDICT. `deriveProjectHealth` reads milestone status: one
// `missed` overrides a manager's reported green, and the done count is the
// progress figure. This panel is the only way to produce that input.
//
// (project, sequence) IS THE IDENTITY, so the form asks for both. Sequence is
// unique per project in the DDL and carries no UPDATE grant - the same anchor
// shape as a territory code.

function MilestoneStatusCell({
  status,
  labels,
}: {
  readonly status: string;
  readonly labels: Record<string, string>;
}) {
  // Only the two that change a reading get a badge. `pending` is the ordinary
  // case and a column of neutral badges hides the rows that matter.
  if (status === "missed") return <StatusBadge tone="danger">{labels[status] ?? status}</StatusBadge>;
  if (status === "done") return <StatusBadge tone="success">{labels[status] ?? status}</StatusBadge>;
  return <span className="text-muted-foreground">{labels[status] ?? status}</span>;
}

/**
 * The column definitions, at MODULE SCOPE with the dictionary passed in.
 *
 * They were inline in the component body, where every `cell` is an arrow that
 * returns an element - and a function defined inside a component that returns
 * JSX is indistinguishable from a nested component to a reader and to a linter
 * (typescript:S6478). Lifting them out settles the question instead of arguing
 * about the heuristic, and the component body is left as state plus a form.
 */
function milestoneColumns(text: {
  milestoneProject: string;
  milestoneSequence: string;
  milestoneName: string;
  milestoneDue: string;
  milestoneStatus: string;
  milestoneStatusLabel: Record<string, string>;
}) {
  return [
    { id: "project", header: text.milestoneProject, cell: (r: MilestoneRow) => r.projectName },
    {
      id: "seq",
      header: text.milestoneSequence,
      align: "right" as const,
      cell: (r: MilestoneRow) => r.sequence,
    },
    { id: "name", header: text.milestoneName, cell: (r: MilestoneRow) => r.name },
    { id: "due", header: text.milestoneDue, cell: (r: MilestoneRow) => r.dueAt ?? "" },
    {
      id: "status",
      header: text.milestoneStatus,
      align: "center" as const,
      cell: (r: MilestoneRow) => (
        <MilestoneStatusCell status={r.status} labels={text.milestoneStatusLabel} />
      ),
    },
  ];
}

export interface MilestoneRow {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly sequence: number;
  readonly name: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly completedAt: string | null;
}

export interface MilestonePanelProps {
  readonly rows: readonly MilestoneRow[];
  readonly projects: readonly { readonly id: string; readonly name: string }[];
  readonly canEdit: boolean;
  readonly onSave: (
    projectId: string,
    input: {
      sequence: number;
      name: string;
      dueAt: string | null;
      completedAt: string | null;
      status: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
}

const BLANK = { projectId: "", sequence: "", name: "", dueAt: "", completedAt: "", status: "pending" };

export function MilestonePanel({ rows, projects, canEdit, onSave }: MilestonePanelProps) {
  const { DATA_TABLE_LABELS, DELIVERY_TEXT, MILESTONE_ERROR } = useMessages();
  const [form, setForm] = useState(BLANK);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const sequence = Number(form.sequence);
  const ready =
    form.projectId !== "" &&
    form.name.trim() !== "" &&
    form.sequence.trim() !== "" &&
    Number.isInteger(sequence) &&
    sequence >= 0;

  return (
    <Section
      id="milestones"
      icon="flag"
      title={DELIVERY_TEXT.milestonesTitle}
      description={DELIVERY_TEXT.milestonesWhy}
    >
      {rows.length === 0 ? (
        <EmptyState
          title={DELIVERY_TEXT.milestonesNone}
          description={DELIVERY_TEXT.milestonesNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: MilestoneRow) => r.id}
          rows={[...rows]}
          columns={milestoneColumns(DELIVERY_TEXT)}
        />
      )}

      {!canEdit ? (
        <p className="text-muted-foreground mt-sm text-xs">{DELIVERY_TEXT.milestonesDenied}</p>
      ) : (
        <div className="mt-md flex flex-wrap items-end gap-sm">
          <Field>
            <FieldLabel>{DELIVERY_TEXT.milestoneProject}</FieldLabel>
            <NativeSelect
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            >
              <option value="">{DELIVERY_TEXT.milestonePickProject}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{DELIVERY_TEXT.milestoneSequence}</FieldLabel>
            <Input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.sequence}
              onChange={(e) => setForm({ ...form, sequence: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{DELIVERY_TEXT.milestoneName}</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>{DELIVERY_TEXT.milestoneDue}</FieldLabel>
            <Input
              type="date"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{DELIVERY_TEXT.milestoneStatus}</FieldLabel>
            <NativeSelect
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {Object.entries(DELIVERY_TEXT.milestoneStatusLabel).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{DELIVERY_TEXT.milestoneCompleted}</FieldLabel>
            <Input
              type="date"
              value={form.completedAt}
              onChange={(e) => setForm({ ...form, completedAt: e.target.value })}
            />
          </Field>
          <Button
            disabled={!ready || pending}
            onClick={() =>
              start(() => {
                void onSave(form.projectId, {
                  sequence,
                  name: form.name.trim(),
                  dueAt: form.dueAt === "" ? null : form.dueAt,
                  completedAt: form.completedAt === "" ? null : form.completedAt,
                  status: form.status,
                }).then((r) => {
                  setErr(r.ok ? null : (MILESTONE_ERROR[r.error ?? "denied"] ?? r.error ?? ""));
                  setSaved(r.ok);
                  if (r.ok) setForm(BLANK);
                });
              })
            }
          >
            {DELIVERY_TEXT.milestoneSave}
          </Button>
          {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
          {saved && !err ? (
            <StatusBadge tone="success">{DELIVERY_TEXT.milestoneSaved}</StatusBadge>
          ) : null}
        </div>
      )}
      {/* Said out loud, because it is the reason this panel is not bookkeeping:
          a missed milestone overrides a reported green on the table above. */}
      <p className="text-muted-foreground mt-sm text-xs">{DELIVERY_TEXT.milestoneAffectsHealth}</p>
    </Section>
  );
}
