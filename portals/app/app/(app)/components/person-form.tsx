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
import { knownValues } from "../../domains/shared/suggest";

// 新建/编辑联系人 - a page since 2026-09-05 (owner ruling: content-rich
// operations get a page with the assistant beside the work; one form per file
// for the reachable-codes guard).
//
// The form left the account page's roster, where it REPLACED the whole row on
// every save - the shape that once let an edit to one field silently wipe a
// phone number. Same replace semantics here, said out loud: picking a person
// loads every field, because what you submit is what the row becomes.

type Saved = { ok: boolean; error?: string };

export interface PersonFormRow {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly department: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly wechat: string | null;
  readonly status: string;
}

const BLANK = {
  id: "",
  name: "",
  title: "",
  department: "",
  email: "",
  mobile: "",
  wechat: "",
  status: "active",
};

export function PersonForm({
  accountId,
  rows,
  statusLabel,
  doneHref,
  onSave,
}: {
  readonly accountId: string;
  readonly rows: readonly PersonFormRow[];
  readonly statusLabel: Record<string, string>;
  readonly doneHref: string;
  readonly onSave: (
    accountId: string,
    input: {
      id: string | null;
      name: string;
      title: string | null;
      department: string | null;
      email: string | null;
      mobile: string | null;
      wechat: string | null;
      status: string;
    },
  ) => Promise<Saved>;
}) {
  const { ACCOUNT_TEXT, CONTACT_ERROR, ASSIST_TEXT } = useMessages();
  const [form, setForm] = useState(BLANK);
  const submit = useFormSubmit(doneHref);

  function pick(id: string) {
    if (id === "") return setForm(BLANK);
    const c = rows.find((r) => r.id === id);
    if (!c) return setForm(BLANK);
    // EVERY field loads, because the save replaces the whole row - a field
    // left out of pick would be written back blank.
    setForm({
      id: c.id,
      name: c.name,
      title: c.title ?? "",
      department: c.department ?? "",
      email: c.email ?? "",
      mobile: c.mobile ?? "",
      wechat: c.wechat ?? "",
      status: c.status,
    });
  }

  // The vocabulary this customer's roster already uses. A title typed as
  // 「信息技术总监」 on one person and 「IT总监」 on the next splits every
  // report that groups by it - same argument as the catalogue categories.
  const titles = useMemo(() => knownValues(rows.map((r) => r.title)), [rows]);
  const departments = useMemo(() => knownValues(rows.map((r) => r.department)), [rows]);

  const suggestions: AssistSuggestion[] = [];
  if (form.title.trim() === "") {
    for (const t of titles.slice(0, 2)) {
      suggestions.push({
        id: `title-${t}`,
        label: ASSIST_TEXT.titleKnown(t),
        reason: ASSIST_TEXT.vocabularyWhy,
        apply: () => setForm((f) => ({ ...f, title: t })),
      });
    }
  }
  if (form.department.trim() === "" && departments.length > 0) {
    suggestions.push({
      id: `dept-${departments[0]}`,
      label: ASSIST_TEXT.departmentKnown(departments[0]!),
      reason: ASSIST_TEXT.vocabularyWhy,
      apply: () => setForm((f) => ({ ...f, department: departments[0]! })),
    });
  }

  const ready = form.name.trim() !== "";
  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - see plan-form.tsx.
        <Section icon="user">
          <div className="flex max-w-(--vx-container-xl) flex-col gap-md">
            <Field>
              <FieldLabel>{ACCOUNT_TEXT.contactEditing}</FieldLabel>
              <NativeSelect value={form.id} onChange={(e) => pick(e.target.value)}>
                <option value="">{ACCOUNT_TEXT.contactNew}</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>{ACCOUNT_TEXT.contactName}</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>{ACCOUNT_TEXT.contactTitle}</FieldLabel>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>{ACCOUNT_TEXT.contactDepartment}</FieldLabel>
              <Input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{ACCOUNT_TEXT.contactMobile}</FieldLabel>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>{ACCOUNT_TEXT.contactEmail}</FieldLabel>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{ACCOUNT_TEXT.contactWechat}</FieldLabel>
              <Input value={form.wechat} onChange={(e) => setForm({ ...form, wechat: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>{ACCOUNT_TEXT.contactStatus}</FieldLabel>
              <NativeSelect
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {Object.entries(statusLabel).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave(accountId, {
                        id: form.id === "" ? null : form.id,
                        name: form.name.trim(),
                        title: form.title.trim() === "" ? null : form.title.trim(),
                        department: form.department.trim() === "" ? null : form.department.trim(),
                        email: form.email.trim() === "" ? null : form.email.trim(),
                        mobile: form.mobile.trim() === "" ? null : form.mobile.trim(),
                        wechat: form.wechat.trim() === "" ? null : form.wechat.trim(),
                        status: form.status,
                      }),
                    (c) => CONTACT_ERROR[c] ?? CONTACT_ERROR.denied,
                  )
                }
              >
                {ACCOUNT_TEXT.contactSave}
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
