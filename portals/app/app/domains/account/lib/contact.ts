// The people inside a customer, and what each of them is to the deal.
//
// The decision chain - the board's headline "N 决策人未触达" - is computed
// entirely from `contact.decision_role`, and until now nothing in the product
// could create a contact. The table, its column locks and the action
// `account.contact.upsert` all shipped in batch 1; the verb never did
// (TD-016).
//
// It is the sharpest version of that shape in the repo, because the NEIGHBOUR
// works: `linkContacts` is implemented and wired to a surface, so a member
// could draw relations between contacts while having no way to create one. The
// coverage figure on the front page could only ever describe seed data.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

/** Mirrors chk_contact_status. */
export const CONTACT_STATUSES = ["active", "left", "invalid"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface ContactDraft {
  /** Absent creates; present edits that contact. Contacts have no business
   *  key - unlike a territory or a product, two people can share a name. */
  id?: string | null;
  name: string;
  title: string | null;
  department: string | null;
  /**
   * How to actually reach this person - incr/0024.
   *
   * NOT VALIDATED FOR SHAPE, and that is a decision rather than an omission.
   * The increment carries the long form; the short form is that a CHECK on an
   * email fires in the middle of somebody recording a conversation, over a
   * value that is merely unusual. Trimmed to null, because a blank field and
   * an unrecorded one are the same fact and storing "" makes them look
   * different to every query that asks whether we can reach this person.
   */
  email: string | null;
  mobile: string | null;
  wechat: string | null;
  status: ContactStatus;
}

/**
 * Validate a contact before it is written.
 *
 * `decision_role` and `status` are CHECK constraints in the DDL, so an invalid
 * one would be refused by Postgres with a constraint name. Refusing it here
 * means the person hears which field and why instead of a database error.
 *
 * `influence` is 0-100 and NULLABLE, and the two are different statements:
 * null is "nobody has judged this yet", 0 is "judged, and this person has
 * none". Defaulting null to 0 would turn an unanswered question into an
 * answer - the same distinction the attainment rules keep for an unset quota.
 */
export function planContact(input: ContactDraft): RuleResult<ContactDraft> {
  const name = input.name.trim();
  if (!name) {
    return fail(violation("name_required", "a contact needs a name", "name"));
  }
  if (!(CONTACT_STATUSES as readonly string[]).includes(input.status)) {
    return fail(violation("unknown_status", `${String(input.status)} is not a contact status`, "status"));
  }
  return ok({
    ...input,
    name,
    title: input.title?.trim() || null,
    department: input.department?.trim() || null,
    email: input.email?.trim() || null,
    mobile: input.mobile?.trim() || null,
    wechat: input.wechat?.trim() || null,
  });
}
