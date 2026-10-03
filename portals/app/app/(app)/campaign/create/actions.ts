"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getStrategyStore } from "../../../domains/shared/registry";
import { createCampaign, editCampaign } from "../../../domains/strategy/service";

// Creating and editing a campaign - its own action file, with the form page
// beside it (see domains/strategy/lib/campaign.ts for why the codes are kept
// apart from the execution and plan ones).

function day(v: string | null): Date | null | "bad" {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "bad" : d;
}

/** The fields the create and edit forms share, parsed once. */
function campaignFields(input: {
  name: string;
  planId: string | null;
  segmentId: string | null;
  channel: string | null;
  budgetAmount: number | null;
  currency: string;
  ownerSub: string | null;
  startsAt: string | null;
  endsAt: string | null;
}) {
  const startsAt = day(input.startsAt);
  const endsAt = day(input.endsAt);
  if (startsAt === "bad" || endsAt === "bad") return null;
  return { ...input, startsAt, endsAt };
}

export async function createCampaignAction(input: {
  campaignNo: string;
  name: string;
  planId: string | null;
  segmentId: string | null;
  channel: string | null;
  budgetAmount: number | null;
  currency: string;
  ownerSub: string | null;
  startsAt: string | null;
  endsAt: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const fields = campaignFields(input);
  if (!fields) return { ok: false, error: "invalid_date" };
  const result = await createCampaign(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    { campaignNo: input.campaignNo, ...fields },
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/campaign");
  return { ok: true };
}

export async function saveCampaign(
  id: string,
  input: {
    name: string;
    planId: string | null;
    segmentId: string | null;
    channel: string | null;
    budgetAmount: number | null;
    currency: string;
    ownerSub: string | null;
    startsAt: string | null;
    endsAt: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const fields = campaignFields(input);
  if (!fields) return { ok: false, error: "invalid_date" };
  const result = await editCampaign(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    id,
    fields,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/campaign");
  return { ok: true };
}
