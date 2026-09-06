"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const BLANK = {
  projectId: "",
  sequence: "",
  name: "",
  dueAt: "",
  completedAt: "",
  status: "pending",
  acceptedBy: "",
  acceptedAt: "",
  reason: "",
};

export function MilestoneForm({
  milestones,
  projects,
  initialProjectId,
  onSave,
}: {
  /** Pre-selects the project. The form is reached from a project ROW (owner,
   * 2026-09-06), so arriving with an empty picker would ask again for
   * something the reader has already said by clicking where they clicked. */
  readonly initialProjectId?: string;
  /** The gates that already exist, with what they currently commit to - which
   * is how this form tells an edit from a create, and a plan that moved from
   * one that did not. */
  readonly milestones: readonly {
    readonly projectId: string;
    readonly sequence: number;
    readonly name: string;
    readonly dueAt: string | null;
    readonly status: string;
    readonly completedAt: string | null;
    readonly acceptedBy: string | null;
    readonly acceptedAt: string | null;
  }[];
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
      acceptedAt: string | null;
      acceptedBy: string | null;
      reason: string;
    },
  ) => Promise<Saved>;
}) {
  const { DELIVERY_TEXT, MILESTONE_ERROR, ASSIST_TEXT } = useMessages();
  const [form, setForm] = useState({ ...BLANK, projectId: initialProjectId ?? "" });
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

  // THE GATE BEING REPLACED, if there is one. An upsert keyed on (project,
  // sequence) means typing an existing pair is an EDIT, and the form has to
  // say so - a page that looks like a create and silently rewrites a
  // committed date is the exact thing the change log exists to prevent.
  const held = milestones.find(
    (m) => m.projectId === form.projectId && m.sequence === Number(form.sequence),
  );
  // Only a moved PLAN needs justifying. Working the gate - the status, the
  // completion date, the customer's signature - is not a change to what was
  // committed, and demanding a reason for it would teach people to type
  // anything.
  const planMoved =
    held !== undefined &&
    (held.name !== form.name.trim() || (held.dueAt ?? "") !== form.dueAt);

  // LOAD THE GATE BEFORE ASKING ABOUT IT. Selecting an existing (project,
  // sequence) is an EDIT, and an edit that starts from a blank form reads every
  // untouched field as a change - the reason field appeared before the reader
  // had typed anything, accusing them of moving a plan they had not opened yet.
  //
  // Keyed on the pair and loaded once per pair, so this fills the form when the
  // selection changes and never again - it must not overwrite what is being
  // typed on the next keystroke.
  const loadedKey = useRef<string | null>(null);
  const pairKey = `${form.projectId}#${form.sequence}`;
  useEffect(() => {
    if (loadedKey.current === pairKey) return;
    loadedKey.current = pairKey;
    if (!held) return;
    setForm((f) => ({
      ...f,
      name: held.name,
      dueAt: held.dueAt ?? "",
      // Loaded even though nothing here compares them: whatever this form does
      // not load, it overwrites with a default on save.
      status: held.status,
      completedAt: held.completedAt ?? "",
      // The recorded signature comes back too. Loading a signed-off gate with
      // these blank and saving would erase a customer's acceptance - the one
      // fact on this form that nobody here is entitled to invent or remove.
      acceptedBy: held.acceptedBy ?? "",
      acceptedAt: held.acceptedAt ?? "",
      reason: "",
    }));
  }, [pairKey, held]);

  const accepting = form.status === "done";

  const sequence = Number(form.sequence);
  const ready =
    form.projectId !== "" &&
    form.name.trim() !== "" &&
    form.sequence.trim() !== "" &&
    Number.isInteger(sequence) &&
    sequence >= 0 &&
    // The server refuses this too; refusing it here is what stops the reader
    // meeting the rule as an error message after the fact.
    (!planMoved || form.reason.trim() !== "") &&
    (form.acceptedAt === "" || form.acceptedBy.trim() !== "");

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
            {/* THE CUSTOMER'S SIGN-OFF, RECORDED BY US. Shown only on a gate
                that is done, because that is the only state it can describe -
                and the customer never touches this form, or any other: one of
                our own people writes down who signed and when (incr/0032). */}
            {accepting ? (
              <>
                <Field>
                  <FieldLabel>{DELIVERY_TEXT.milestoneAcceptedBy}</FieldLabel>
                  <Input
                    value={form.acceptedBy}
                    placeholder={DELIVERY_TEXT.milestoneAcceptedByHint}
                    onChange={(e) => setForm({ ...form, acceptedBy: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>{DELIVERY_TEXT.milestoneAcceptedAt}</FieldLabel>
                  <Input
                    type="date"
                    value={form.acceptedAt}
                    onChange={(e) => setForm({ ...form, acceptedAt: e.target.value })}
                  />
                </Field>
              </>
            ) : null}
            {/* MOVING A COMMITTED GATE. Appears only when the plan actually
                differs from what is stored, so the field is never noise - and
                when it does appear it says what is being moved from and to,
                because "why" is unanswerable without that. */}
            {planMoved ? (
              <Field>
                <FieldLabel>{DELIVERY_TEXT.milestoneChangeReason}</FieldLabel>
                <Input
                  value={form.reason}
                  placeholder={DELIVERY_TEXT.milestoneChangeReasonHint}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
                <p className="text-muted-foreground text-body-sm">
                  {DELIVERY_TEXT.milestoneChangeWhy}
                </p>
              </Field>
            ) : null}
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
                        acceptedAt: form.acceptedAt === "" ? null : form.acceptedAt,
                        acceptedBy: form.acceptedBy.trim() === "" ? null : form.acceptedBy.trim(),
                        reason: form.reason,
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
