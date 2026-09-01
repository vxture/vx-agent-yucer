"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getSignalStore } from "../../domains/shared/registry";
import { assignLead } from "../../domains/signal/service";

/**
 * Hand one lead to one person.
 *
 * ONE AT A TIME, and that is the design rather than a limitation. A "route
 * everything" button moves dozens of leads on a click with no record of which
 * the person actually looked at - and the owner of a lead is who gets asked
 * about it, so this is dozens of individual decisions wearing the costume of
 * a batch.
 */
export async function applyAssignment(input: {
  leadId: string;
  ownerSub: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await assignLead(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.signal(),
    },
    input.leadId,
    input.ownerSub,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/routing");
  return { ok: true };
}
