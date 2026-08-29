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

// How the market is cut.
//
// `strategy.segment.view` / `.upsert` shipped in batch 1 with nothing behind
// them (TD-016), and like the campaign executions this was not merely an
// unfinished middle - it left an anchor dangling. Seven demo accounts carry a
// `segment_code` of MIDMARKET or ENTERPRISE, and `campaign.segment_id` is a
// real foreign key, but no segment could be created, so every one of those
// references pointed at a table with no rows.
//
// THE CODE IS THE IDENTITY, and that is why it locks once a segment exists.
// `campaign.segment_id` is enforced by a foreign key; `account.segment_code` is
// a plain string with nothing behind it. A rename would break the second
// silently - the database would not complain and no page would show a gap. The
// column locks say the same thing from the other side: segment_code carries no
// UPDATE grant.

export interface SegmentRow {
  readonly id: string;
  readonly segmentCode: string;
  readonly name: string;
  readonly planId: string | null;
  readonly planName: string | null;
  readonly priority: number;
  readonly status: string;
  /** Accounts carrying this code. The number the anchor was missing. */
  readonly accountCount: number;
}

export interface SegmentPanelProps {
  readonly rows: readonly SegmentRow[];
  /** Plans a segment may hang off. Closed and archived ones are absent: their
   *  segmentation is settled. */
  readonly plans: readonly { readonly id: string; readonly name: string }[];
  readonly canEdit: boolean;
  readonly onSave: (input: {
    segmentCode: string;
    name: string;
    planId: string | null;
    priority: number;
    status: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

const BLANK = { segmentCode: "", name: "", planId: "", priority: "0", status: "active" };

function segmentColumns(text: {
  segmentCodeHeader: string;
  segmentNameHeader: string;
  segmentPlanHeader: string;
  segmentPriorityHeader: string;
  segmentAccountsHeader: string;
  segmentStatusHeader: string;
  segmentStatusLabel: Record<string, string>;
}) {
  return [
    { id: "code", header: text.segmentCodeHeader, cell: (r: SegmentRow) => r.segmentCode },
    { id: "name", header: text.segmentNameHeader, cell: (r: SegmentRow) => r.name },
    { id: "plan", header: text.segmentPlanHeader, cell: (r: SegmentRow) => r.planName ?? "" },
    {
      id: "priority",
      header: text.segmentPriorityHeader,
      align: "right" as const,
      cell: (r: SegmentRow) => String(r.priority),
    },
    {
      id: "accounts",
      header: text.segmentAccountsHeader,
      align: "right" as const,
      // Zero is worth showing rather than blanking: a segment nothing points at
      // is a cut of the market nobody is working, which is a finding, not a gap
      // in the table.
      cell: (r: SegmentRow) => String(r.accountCount),
    },
    {
      id: "status",
      header: text.segmentStatusHeader,
      align: "center" as const,
      cell: (r: SegmentRow) =>
        r.status === "active" ? (
          <span>{text.segmentStatusLabel[r.status] ?? r.status}</span>
        ) : (
          <StatusBadge tone="warning">{text.segmentStatusLabel[r.status] ?? r.status}</StatusBadge>
        ),
    },
  ];
}

export function SegmentPanel({ rows, plans, canEdit, onSave }: SegmentPanelProps) {
  const { DATA_TABLE_LABELS, STRATEGY_TEXT, SEGMENT_ERROR } = useMessages();
  const [form, setForm] = useState(BLANK);
  const save = useSaveAction(SEGMENT_ERROR);

  const editing = form.segmentCode !== "" && rows.some((r) => r.segmentCode === form.segmentCode);

  function pick(code: string) {
    if (code === "") return setForm(BLANK);
    const g = rows.find((r) => r.segmentCode === code);
    if (!g) return setForm(BLANK);
    setForm({
      segmentCode: g.segmentCode,
      name: g.name,
      planId: g.planId ?? "",
      priority: String(g.priority),
      status: g.status,
    });
  }

  const priority = Number(form.priority);
  const ready =
    form.segmentCode.trim() !== "" &&
    form.name.trim() !== "" &&
    Number.isInteger(priority) &&
    priority >= 0;

  return (
    <Section
      id="segments"
      icon="target"
      title={STRATEGY_TEXT.segmentsTitle}
      description={STRATEGY_TEXT.segmentsWhy}
    >
      {rows.length === 0 ? (
        <EmptyState
          title={STRATEGY_TEXT.segmentsNone}
          description={STRATEGY_TEXT.segmentsNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: SegmentRow) => r.id}
          rows={[...rows]}
          columns={segmentColumns(STRATEGY_TEXT)}
        />
      )}

      {!canEdit ? (
        <p className="text-muted-foreground mt-sm text-xs">{STRATEGY_TEXT.segmentsDenied}</p>
      ) : (
        <div className="mt-md flex flex-wrap items-end gap-sm">
          <Field>
            <FieldLabel>{STRATEGY_TEXT.segmentEditing}</FieldLabel>
            <NativeSelect value={editing ? form.segmentCode : ""} onChange={(e) => pick(e.target.value)}>
              <option value="">{STRATEGY_TEXT.segmentNew}</option>
              {rows.map((r) => (
                <option key={r.id} value={r.segmentCode}>
                  {r.segmentCode} - {r.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{STRATEGY_TEXT.segmentCodeHeader}</FieldLabel>
            {/* Locked while editing. The code is what accounts point at, so the
                field that would rename it is the field that must not exist. */}
            <Input
              value={form.segmentCode}
              disabled={editing}
              onChange={(e) => setForm({ ...form, segmentCode: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{STRATEGY_TEXT.segmentNameHeader}</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>{STRATEGY_TEXT.segmentPlanHeader}</FieldLabel>
            <NativeSelect
              value={form.planId}
              onChange={(e) => setForm({ ...form, planId: e.target.value })}
            >
              <option value="">{STRATEGY_TEXT.segmentNoPlan}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{STRATEGY_TEXT.segmentPriorityHeader}</FieldLabel>
            <Input
              type="number"
              min={0}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{STRATEGY_TEXT.segmentStatusHeader}</FieldLabel>
            <NativeSelect
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {Object.entries(STRATEGY_TEXT.segmentStatusLabel).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <SaveRow
            action={save}
            label={STRATEGY_TEXT.segmentSave}
            savedLabel={STRATEGY_TEXT.segmentSaved}
            disabled={!ready}
            onSave={() =>
              save.run(
                () =>
                  onSave({
                    segmentCode: form.segmentCode.trim(),
                    name: form.name.trim(),
                    planId: form.planId === "" ? null : form.planId,
                    priority,
                    status: form.status,
                  }),
                () => setForm(BLANK),
              )
            }
          />
        </div>
      )}
    </Section>
  );
}
