"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getDeliveryStore, getPipelineStore } from "../../domains/shared/registry";
import { renewalDraft } from "../../domains/delivery/service";
import { createOpportunity, listRenewedProjectIds } from "../../domains/pipeline/service";

/**
 * Open the renewal deal for one delivered subscription.
 *
 * THREE CALLS AND TWO DOMAINS, in that order, on purpose:
 *
 *   1. D6 says which projects already have a deal open off them.
 *   2. D7 re-derives THIS project's draft, now, against that answer.
 *   3. D6 creates the opportunity and freezes its lineage.
 *
 * The re-derivation is not redundant with the page. A page can be minutes old,
 * and in that time the term can lapse, the project can be cancelled, or a
 * colleague can open the renewal - so "the button was there when I clicked it"
 * has to be re-asked as "is this still due". Trusting the row the browser sent
 * would let a stale page create a second live approach to one customer about
 * one contract.
 *
 * ONE AT A TIME, like /routing's assign, and for a stronger reason: this is a
 * commercial approach to a customer, not an internal reassignment.
 *
 * THE DRAFT IS NOT ACCEPTED FROM THE CLIENT either - only a projectId is. The
 * amount, the name and the account all come back out of the rule layer, so a
 * crafted request cannot open a deal at a price nobody chose.
 */
export async function openRenewal(input: {
  projectId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const renewed = await listRenewedProjectIds({ ...base, store: session.stores.pipeline() });
  if (!renewed.ok) return { ok: false, error: renewed.violations[0]?.code ?? "denied" };

  const draft = await renewalDraft(
    { ...base, store: getDeliveryStore() },
    input.projectId,
    { alreadyRenewed: renewed.value.has(input.projectId) },
  );
  if (!draft.ok) return { ok: false, error: draft.violations[0]?.code ?? "denied" };

  const created = await createOpportunity(
    { ...base, store: session.stores.pipeline() },
    {
      name: draft.value.name,
      accountId: draft.value.accountId,
      // No territory and no owner decided here. Whoever opens it owns it -
      // createOpportunity falls back to ctx.sub - and the territory is a
      // planning question this derivation has no business answering.
      territoryId: null,
      ownerSub: null,
      amount:
        draft.value.amount === null
          ? null
          : { amount: draft.value.amount, currency: draft.value.currency },
      // Deliberately null. When the next term starts is a negotiation, and a
      // guessed close date would go straight into the forecast.
      expectedCloseAt: null,
      // The frozen lineage. This is what stops the same project being proposed
      // again on the next page load.
      sourceProjectId: draft.value.sourceProjectId,
      currency: draft.value.currency,
    },
  );
  if (!created.ok) return { ok: false, error: created.violations[0]?.code ?? "denied" };

  revalidatePath("/renewal");
  return { ok: true };
}
