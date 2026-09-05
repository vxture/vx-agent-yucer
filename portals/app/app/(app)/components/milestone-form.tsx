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
import { nextSequence, projectsWithoutMilestones } from "../../domains/delivery/lib/suggest";

// 录入里程碑 - a page since 2026-09-05 (owner ruling; one form per file, see
// plan-form.tsx). The stake survives the move: a missed milestone OVERRIDES a
// reported green on project health, so a project with no milestones has a
// health nobody can contradict - which is exactly what the assistant points at.

type Saved = { ok: boolean; error?: string };

const BLANK = { projectId: "", sequence: "", name: "", dueAt: "", completedAt: "", status: "pending" };

export function MilestoneForm({
  milestones,
  projects,
  onSave,
}: {
  readonly milestones: readonly { readonly projectId: string; readonly sequence: number }[];
  readonly projects: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  }[];
  readonly onSave: (
    projectId: string,
    input: {
      sequence: number;
      name: string;
      dueAt: string | null;
      completedAt: string | null;
      status: string;
    },
  ) => Promise<Saved>;
}) {
  const { DELIVERY_TEXT, MILESTONE_ERROR, ASSIST_TEXT } = useMessages();
  const [form, setForm] = useState(BLANK);
  const submit = useFormSubmit("/delivery");

  const unchecked = useMemo(
    () => projectsWithoutMilestones(projects, milestones),
    [projects, milestones],
  );

  const suggestions: AssistSuggestion[] = [];
  // Delivering projects whose health nothing can contradict yet.
  for (const p of unchecked.slice(0, 2)) {
    if (form.projectId === p.id) continue;
    suggestions.push({
      id: `proj-${p.id}`,
      label: ASSIST_TEXT.projectUnchecked(p.name),
      reason: ASSIST_TEXT.projectUncheckedWhy,
      apply: () => setForm((f) => ({ ...f, projectId: p.id })),
    });
  }
  // The next number in the chosen project's own series. Computed only once a
  // project is chosen - a sequence belongs to a project, not to the workspace.
  if (form.projectId !== "" && form.sequence.trim() === "") {
    const seq = nextSequence(milestones, form.projectId);
    suggestions.push({
      id: "seq",
      label: ASSIST_TEXT.sequenceNext(seq),
      reason: ASSIST_TEXT.sequenceNextWhy,
      apply: () => setForm((f) => ({ ...f, sequence: String(seq) })),
    });
  }

  const sequence = Number(form.sequence);
  const ready =
    form.projectId !== "" &&
    form.name.trim() !== "" &&
    form.sequence.trim() !== "" &&
    Number.isInteger(sequence) &&
    sequence >= 0;

  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - see plan-form.tsx.
        <Section icon="flag">
          <div className="flex max-w-(--vx-container-xl) flex-col gap-md">
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
            {/* Said out loud, because it is the reason this form is not
                bookkeeping: a missed milestone overrides a reported green. */}
            <p className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.milestoneAffectsHealth}</p>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave(form.projectId, {
                        sequence,
                        name: form.name.trim(),
                        dueAt: form.dueAt === "" ? null : form.dueAt,
                        completedAt: form.completedAt === "" ? null : form.completedAt,
                        status: form.status,
                      }),
                    (c) => MILESTONE_ERROR[c] ?? MILESTONE_ERROR.denied,
                  )
                }
              >
                {DELIVERY_TEXT.milestoneSave}
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
