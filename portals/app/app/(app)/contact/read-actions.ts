"use server";
import { resolveAppSession } from "../lib/session";
import { readContactRoster, readContactView } from "../../domains/account/contact-read";

async function context() {
  const session = await resolveAppSession();
  if (!session) return null;
  return { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement, store: session.stores.account() };
}
export async function loadContactRoster(accountId: string) {
  try {
    const ctx = await context();
    if (!ctx) return { ok: false as const };
    const result = await readContactRoster(ctx, accountId);
    return result.ok ? { ok: true as const, data: result.value } : { ok: false as const };
  } catch { return { ok: false as const }; }
}
export async function loadContactView(accountId: string, contactId: string) {
  try {
    const ctx = await context();
    if (!ctx) return { ok: false as const };
    const result = await readContactView(ctx, accountId, contactId);
    return result.ok ? { ok: true as const, data: result.value } : { ok: false as const };
  } catch { return { ok: false as const }; }
}
