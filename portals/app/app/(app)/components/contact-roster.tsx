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
  /** incr/0024 - how to reach this person. */
  readonly email: string | null;
  readonly mobile: string | null;
  readonly wechat: string | null;
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
      email: string | null;
      mobile: string | null;
      wechat: string | null;
      status: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
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

export function ContactRoster({ accountId, contacts, canEdit, onSave }: ContactRosterProps) {
  const { DATA_TABLE_LABELS, ACCOUNT_TEXT, DECISION_ROLE_LABEL, CONTACT_ERROR } = useMessages();
  const [form, setForm] = useState(BLANK);
  const save = useSaveAction(CONTACT_ERROR);

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
      // Loaded from the row for the same reason the other fields are: this
      // form REPLACES the contact, so a field left out of `pick` would be
      // written back blank. That is how an edit to a decision role silently
      // deletes a phone number.
      email: c.email ?? "",
      mobile: c.mobile ?? "",
      wechat: c.wechat ?? "",
      status: c.status,
    });
  }

  // A name is the whole requirement now. The influence range check went with
  // the field - incr/0027 moved that number to the deal, where it is validated
  // by setBuyingRole and by chk_opportunity_contact_influence.
  const ready = form.name.trim() !== "";

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
            // THE ROLE AND INFLUENCE COLUMNS ARE GONE - incr/0027. This table
            // is the customer's roster: who works here and how to reach them.
            // What each of them is to a purchase is on the deal, and showing
            // one answer here would be showing the same wrong answer for every
            // deal at once, which is what the column used to do.
            {
              id: "mobile",
              header: ACCOUNT_TEXT.contactMobile,
              cell: (r: ContactRow) => r.mobile ?? "",
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
        <p className="text-muted-foreground mt-sm text-body-sm">{ACCOUNT_TEXT.contactsDenied}</p>
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
          {/* THE ROLE AND INFLUENCE FIELDS ARE GONE - incr/0027.
              A person is not an economic buyer; they are an economic buyer ON A
              DEAL. Both moved to the opportunity, where the question can be
              answered. What stays here is what a person actually is: a name, a
              job, and a way to reach them. */}
          <Field>
            <FieldLabel>{ACCOUNT_TEXT.contactMobile}</FieldLabel>
            <Input
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            />
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
            <Input
              value={form.wechat}
              onChange={(e) => setForm({ ...form, wechat: e.target.value })}
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
          <SaveRow
            action={save}
            label={ACCOUNT_TEXT.contactSave}
            savedLabel={ACCOUNT_TEXT.contactSaved}
            disabled={!ready}
            onSave={() =>
              save.run(
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
                () => setForm(BLANK),
              )
            }
          />
        </div>
      )}
    </Section>
  );
}
