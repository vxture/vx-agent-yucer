"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getPipelineStore, getSignalStore } from "../../domains/shared/registry";
import { advanceLead } from "../../domains/signal/service";
import { convertLeadToOpportunity } from "../../domains/conversion";

// Write paths for the lead list.
//
// The client sends a lead id and a verb. The account, the attribution, the
// opportunity number and the owner are all derived server-side - a client that
// could supply attribution could decide after the fact where a deal came from,
// which is the one thing the frozen keys exist to prevent.

export type LeadAction = "qualify" | "disqualify" | "convert";

export interface LeadActionResult {
  ok: boolean;
  error?: string;
  /** Set after a successful conversion, so the UI can point at the new deal. */
  opportunityNo?: string;
  attributionSource?: string;
}

export async function actOnLead(leadId: string, action: LeadAction): Promise<LeadActionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  if (action === "convert") {
    const result = await convertLeadToOpportunity(
      { ...base, signalStore: session.stores.signal(), pipelineStore: session.stores.pipeline() },
      { leadId },
    );
    if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

    revalidatePath("/signal");
    revalidatePath("/pipeline");
    return {
      ok: true,
      opportunityNo: result.value.opportunity.opportunityNo,
      attributionSource: result.value.attribution.source,
    };
  }

  const result = await advanceLead(
    { ...base, store: session.stores.signal() },
    leadId,
    action === "qualify" ? "qualified" : "disqualified",
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  revalidatePath("/signal");
  return { ok: true };
}
