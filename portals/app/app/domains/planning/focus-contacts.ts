import { getAccountDetail } from "../account/service";
import { contactSummaries } from "../account/contact-read";
import type { ContactRecord } from "../account/store";
import type { FocusContext } from "./focus-read";
import type { FocusRow } from "./focus-model";

/** Only the lead identity and count cross the client boundary; cache stays server-side. */
export async function readFocusContacts(ctx: FocusContext, rows: FocusRow[]) {
  const cache = new Map<string, ContactRecord[]>();
  const pending = [...rows];
  const workers = Array.from({ length: Math.min(6, pending.length) }, async function next(): Promise<void> {
    const row = pending.shift();
    if (!row) return;
    try {
      const result = await getAccountDetail({ workspaceId: ctx.workspaceId, sub: ctx.sub, holder: ctx.holder, entitlement: ctx.entitlement, store: ctx.accounts }, row.id);
      if (result.ok) {
        cache.set(row.id, result.value.contacts);
        const summaries = contactSummaries(result.value.contacts);
        row.contacts = { state: "ready", total: summaries.length, first: summaries[0] ?? null };
      }
    } catch { /* A failed source is not an empty roster. */ }
    return next();
  });
  await Promise.all(workers);
  return cache;
}
