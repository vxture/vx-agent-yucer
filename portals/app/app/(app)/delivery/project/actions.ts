"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getDeliveryStore } from "../../../domains/shared/registry";
import { cancelProject, createProject, editProject } from "../../../domains/delivery/service";
import { ENGAGEMENT_TYPES, type ProjectEngagement } from "../../../domains/delivery/lib/project";

// Creating, editing and calling off a project - its own action file, beside its
// form page (see domains/delivery/lib/project.ts for why the codes are kept
// apart from the milestone and revenue ones).

type Result = { ok: boolean; error?: string };

type Fields = {
  name: string;
  managerSub: string | null;
  contractAmount: number | null;
  currency: string;
  endsAt: string | null;
  engagementType: string;
};

function parse(input: Fields) {
  let endsAt: Date | null = null;
  if (input.endsAt) {
    endsAt = new Date(`${input.endsAt}T00:00:00Z`);
    if (Number.isNaN(endsAt.getTime())) return null;
  }
  const engagementType = (ENGAGEMENT_TYPES as readonly string[]).includes(input.engagementType)
    ? (input.engagementType as ProjectEngagement)
    : ("one_off" as const);
  return { ...input, endsAt, engagementType };
}

export async function createProjectAction(
  input: Fields & { projectNo: string; accountId: string; opportunityId: string | null },
): Promise<Result> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const fields = parse(input);
  if (!fields) return { ok: false, error: "invalid_date" };

  // The customer and the deal are read through the member's OWN scoped stores:
  // a customer they cannot see reads as not found, never as a link.
  const account = await session.stores.account().getAccount(session.workspaceId, input.accountId);
  const deal = input.opportunityId
    ? await session.stores.pipeline().getOpportunity(session.workspaceId, input.opportunityId)
    : undefined;

  const result = await createProject(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getDeliveryStore(),
    },
    { ...fields, projectNo: input.projectNo, accountId: input.accountId, opportunityId: input.opportunityId },
    {
      accountFound: Boolean(account),
      opportunityAccountId: input.opportunityId ? (deal?.accountId ?? null) : undefined,
    },
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/delivery");
  return { ok: true };
}

export async function saveProject(id: string, input: Fields): Promise<Result> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const fields = parse(input);
  if (!fields) return { ok: false, error: "invalid_date" };
  const result = await editProject(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getDeliveryStore(),
    },
    id,
    fields,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/delivery");
  return { ok: true };
}

export async function cancelProjectAction(id: string): Promise<Result> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const result = await cancelProject(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getDeliveryStore(),
    },
    id,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/delivery");
  return { ok: true };
}
