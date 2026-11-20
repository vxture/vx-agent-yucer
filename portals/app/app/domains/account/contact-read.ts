import { getAccountDetail, type AccountContext } from "./service";
import type { ContactRecord } from "./store";
import { fail, ok, violation, type RuleResult } from "../shared/result";

export type ContactSummary = Pick<ContactRecord, "id" | "name" | "title" | "department" | "status">;
export type ContactRosterSummary = { state: "unavailable" } | { state: "ready"; total: number; first: ContactSummary | null };
export type ContactView = ContactSummary & Pick<ContactRecord, "email" | "mobile" | "wechat">;

/** Preserve the customer roster order, preferring current staff for the lead. */
export function contactSummaries(rows: readonly ContactRecord[]): ContactSummary[] {
  return [...rows.filter(row => row.status === "active"), ...rows.filter(row => row.status !== "active")]
    .map(({ id, name, title, department, status }) => ({ id, name, title, department, status }));
}

export async function readContactRoster(ctx: AccountContext, accountId: string): Promise<RuleResult<{ accountName: string; contacts: ContactSummary[] }>> {
  const result = await getAccountDetail(ctx, accountId);
  if (!result.ok) return result;
  return ok({ accountName: result.value.account.name, contacts: contactSummaries(result.value.contacts) });
}

/** Both UUIDs must match the currently authorized customer relationship. */
export async function readContactView(ctx: AccountContext, accountId: string, contactId: string): Promise<RuleResult<{ accountName: string; contact: ContactView }>> {
  const result = await getAccountDetail(ctx, accountId);
  if (!result.ok) return result;
  const row = result.value.contacts.find(contact => contact.id === contactId);
  if (!row) return fail(violation("not_found", "contact not found on this account", "contactId"));
  const { id, name, title, department, status, email, mobile, wechat } = row;
  return ok({ accountName: result.value.account.name, contact: { id, name, title, department, status, email, mobile, wechat } satisfies ContactView });
}
