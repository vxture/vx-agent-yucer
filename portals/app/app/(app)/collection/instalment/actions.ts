"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getDeliveryStore } from "../../../domains/shared/registry";
import { createInstalment } from "../../../domains/delivery/service";

// Adding an instalment to a project's collection plan - its own action file,
// beside its form page (see domains/delivery/lib/instalment.ts for why the codes
// are kept apart from the other delivery forms').

export async function createInstalmentAction(input: {
  projectId: string;
  milestoneId: string;
  plannedAmount: number;
  currency: string;
  dueAt: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  let dueAt: Date | null = null;
  if (input.dueAt) {
    dueAt = new Date(`${input.dueAt}T00:00:00Z`);
    if (Number.isNaN(dueAt.getTime())) return { ok: false, error: "invalid_date" };
  }
  const result = await createInstalment(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getDeliveryStore(),
    },
    { projectId: input.projectId, milestoneId: input.milestoneId, plannedAmount: input.plannedAmount, currency: input.currency, dueAt },
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/collection");
  revalidatePath("/delivery");
  return { ok: true };
}
