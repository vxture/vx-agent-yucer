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

// The people inside a customer.
//
// `account.contact.upsert` was in the action catalogue from batch 1 with no
// verb behind it (TD-016), and this was the sharpest case: `linkContacts` is
// implemented and has a surface, so a member could draw relations between
// contacts while having no way to create one. The board's headline
// "N 决策人未触达" is computed from decision_role, so it could only ever
// describe seed data.
//
// OUTSIDE the decision-chain block on purpose. The chain is gated by
// `account.graph`, a PRO capability; adding a contact rides the free
// `account.manage`. Nesting this inside the chain would make a starter
// workspace unable to record who it is talking to.
//
// ID IS THE IDENTITY, so "who am I editing" is an explicit control rather than
// a guess: two people at one customer can share a name, and matching on one
// would merge colleagues.

function ContactStatus({
  status,
  labels,
}: {
  readonly status: string;
  readonly labels: Record<string, string>;
}) {
  // Nothing for the ordinary case: a column of "active" badges is noise that
  // hides the two rows where the status is the point.
  if (status === "active") return null;
  return <StatusBadge tone="neutral">{labels[status] ?? status}</StatusBadge>;
}

export interface ContactRow {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly department: string | null;
  readonly decisionRole: string;
  readonly influence: number | null;
  readonly status: string;
}

export interface ContactRosterProps {
  readonly accountId: string;
  readonly contacts: readonly ContactRow[];
  readonly canEdit: boolean;
  readonly onSave: (
    accountId: string,
    input: {
      id: string | null;
      name: string;
      title: string | null;
      department: string | null;
      decisionRole: string;
      influence: number | null;
      status: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
}

const BLANK = {
  id: "",
  name: "",
  title: "",
  department: "",
  decisionRole: "unknown",
  influence: "",
  status: "active",
};

export function ContactRoster({ accountId, contacts, canEdit, onSave }: ContactRosterProps) {
  const { DATA_TABLE_LABELS, ACCOUNT_TEXT, DECISION_ROLE_LABEL, CONTACT_ERROR } = useMessages();
  const [form, setForm] = useState(BLANK);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  // Choosing an existing person fills the form from that row. Without this the
  // control would say "editing X" and then write whatever happened to be in the
  // fields, which is a worse lie than having no edit at all.
  function pick(id: string) {
    if (id === "") return setForm(BLANK);
    const c = contacts.find((x) => x.id === id);
    if (!c) return setForm(BLANK);
    setForm({
      id: c.id,
      name: c.name,
      title: c.title ?? "",
      department: c.department ?? "",
      decisionRole: c.decisionRole,
      influence: c.influence === null ? "" : String(c.influence),
      status: c.status,
    });
  }

  const influence = form.influence.trim() === "" ? null : Number(form.influence);
  const ready =
    form.name.trim() !== "" &&
    (influence === null ||
      (Number.isInteger(influence) && influence >= 0 && influence <= 100));

  return (
    <Section
      id="contacts"
      icon="users"
      title={ACCOUNT_TEXT.contactsTitle}
      description={ACCOUNT_TEXT.contactsWhy}
    >
      {contacts.length === 0 ? (
        <EmptyState
          title={ACCOUNT_TEXT.contactsNone}
          description={ACCOUNT_TEXT.contactsNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: ContactRow) => r.id}
          rows={[...contacts]}
          columns={[
            { id: "name", header: ACCOUNT_TEXT.contactName, cell: (r: ContactRow) => r.name },
            {
              id: "title",
              header: ACCOUNT_TEXT.contactTitle,
              cell: (r: ContactRow) => r.title ?? "",
            },
            {
              id: "role",
              header: ACCOUNT_TEXT.contactRole,
              cell: (r: ContactRow) =>
                DECISION_ROLE_LABEL[r.decisionRole] ?? r.decisionRole,
            },
            {
              id: "influence",
              header: ACCOUNT_TEXT.contactInfluence,
              align: "right" as const,
              // Blank for null, not 0. "Nobody has judged this" and "judged, and
              // none" are different facts and the column must not merge them.
              cell: (r: ContactRow) => (r.influence === null ? "" : String(r.influence)),
            },
            {
              id: "status",
              header: ACCOUNT_TEXT.contactStatus,
              align: "center" as const,
              // A component at module scope rather than an inline arrow that
              // returns JSX. The DS makes `cell` a render callback so either
              // works, but a function defined in a component body and returning
              // an element is indistinguishable from a nested component to a
              // reader and to a linter - and the fix the linter asks for
              // (module scope, data as props) is the clearer shape anyway.
              cell: (r: ContactRow) => (
                <ContactStatus status={r.status} labels={ACCOUNT_TEXT.contactStatusLabel} />
              ),
            },
          ]}
        />
      )}

      {!canEdit ? (
        <p className="text-muted-foreground mt-sm text-xs">{ACCOUNT_TEXT.contactsDenied}</p>
      ) : (
        <div className="mt-md flex flex-wrap items-end gap-sm">
          <Field>
            <FieldLabel>{ACCOUNT_TEXT.contactEditing}</FieldLabel>
            <NativeSelect value={form.id} onChange={(e) => pick(e.target.value)}>
              <option value="">{ACCOUNT_TEXT.contactNew}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{ACCOUNT_TEXT.contactName}</FieldLabel>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{ACCOUNT_TEXT.contactTitle}</FieldLabel>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{ACCOUNT_TEXT.contactDepartment}</FieldLabel>
            <Input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{ACCOUNT_TEXT.contactRole}</FieldLabel>
            <NativeSelect
              value={form.decisionRole}
              onChange={(e) => setForm({ ...form, decisionRole: e.target.value })}
            >
              {Object.entries(DECISION_ROLE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{ACCOUNT_TEXT.contactInfluence}</FieldLabel>
            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              inputMode="numeric"
              value={form.influence}
              onChange={(e) => setForm({ ...form, influence: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{ACCOUNT_TEXT.contactStatus}</FieldLabel>
            <NativeSelect
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {Object.entries(ACCOUNT_TEXT.contactStatusLabel).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Button
            disabled={!ready || pending}
            onClick={() =>
              start(() => {
                void onSave(accountId, {
                  id: form.id === "" ? null : form.id,
                  name: form.name.trim(),
                  title: form.title.trim() === "" ? null : form.title.trim(),
                  department: form.department.trim() === "" ? null : form.department.trim(),
                  decisionRole: form.decisionRole,
                  influence,
                  status: form.status,
                }).then((r) => {
                  setErr(r.ok ? null : (CONTACT_ERROR[r.error ?? "denied"] ?? r.error ?? ""));
                  setSaved(r.ok);
                  if (r.ok) setForm(BLANK);
                });
              })
            }
          >
            {ACCOUNT_TEXT.contactSave}
          </Button>
          {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
          {saved && !err ? (
            <StatusBadge tone="success">{ACCOUNT_TEXT.contactSaved}</StatusBadge>
          ) : null}
        </div>
      )}
    </Section>
  );
}
