"use client";

import {
  Button,
  DataTable,
  EmptyState,
  Field,
  FieldLabel,
  FilterBar,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
} from "@vxture/design-ui";
import { useTableSort } from "./table-fittings";
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
  /** The person form's page, carrying this account - the create/edit form left
   *  the roster on 2026-09-05 (the consolidation ruling). */
  readonly editHref: string;
}

/* 排序取值: what each sortable column ORDERS ON. Not always what the cell
   renders - a money cell sorts on the raw amount, not its formatted string. */
const SORT_ON = {
  name: (r: ContactRow) => r.name,
};

export function ContactRoster({ contacts, canEdit, editHref }: ContactRosterProps) {
  const { DATA_TABLE_LABELS, ACCOUNT_TEXT } = useMessages();
  const sorted = useTableSort<ContactRow>([], SORT_ON);
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
        <>
        {/* 按需 - COUNT ONLY (owner's 按需添加, 2026-09-07). This is the roster
            of ONE customer's people, not a directory: the whole list is on
            screen, and a keyword box for finding something already visible is
            a control that does nothing. The count answers a question the
            heading cannot - how many people we actually know inside this
            account, which is the coverage question this section exists for. */}
        <FilterBar count={ACCOUNT_TEXT.contactCount(contacts.length)} />

        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: ContactRow) => r.id}
          rows={[...sorted.sortRows(contacts)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
          columns={[
            {
              id: "name",
  sortable: true,
              header: ACCOUNT_TEXT.contactName,
              // 只有一行值也走 TableTitleCell (owner, 2026-09-07): the point of
              // the fitting is that the first column has ONE shape across the
              // product, and a bare string in one table breaks the row rhythm
              // the pinned line heights exist to hold.
              cell: (r: ContactRow) => <TableTitleCell title={r.name} tooltip={r.name} />,
            },
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
        </>
      )}

      {!canEdit ? (
        <p className="text-muted-foreground mt-sm text-body-sm">{ACCOUNT_TEXT.contactsDenied}</p>
      ) : (
        <div className="mt-md">
          <Button asChild variant="secondary">
            <a href={editHref}>{ACCOUNT_TEXT.contactSave}</a>
          </Button>
        </div>
      )}
    </Section>
  );
}
