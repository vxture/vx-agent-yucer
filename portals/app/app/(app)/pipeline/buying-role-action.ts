"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { setBuyingRole } from "../../domains/account/service";

// Stating who somebody is ON ONE DEAL - incr/0027, ADR-024.
//
// WHY THIS ACTION HAD TO EXIST BEFORE THE BATCH COULD SHIP. Dropping
// person.decision_role removed the only way a role could be recorded, so
// without a surface that writes one the decision chain would be permanently
// empty on every deal except the ones the demo seed fills - the exact shape of
// the defect wired.test.ts was written to catch, arrived at from the other
// direction. A refactor that leaves the product unable to enter its own data is
// not finished.
//
// THE ACCOUNT ID IS TAKEN, unused by the domain, purely to revalidate the
// customer page: it renders one chain per open deal, so a role stated here
// changes what is shown there too.

export interface SetBuyingRoleResult {
  ok: boolean;
  error?: string;
}

export async function saveBuyingRole(
  opportunityId: string,
  accountId: string,
  personId: string,
  buyingRole: string,
  influence: number | null,
): Promise<SetBuyingRoleResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await setBuyingRole(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
    },
    opportunityId,
    personId,
    // The domain validates against DECISION_ROLES and refuses anything else, so
    // the string crosses the boundary unnarrowed rather than being cast here
    // into a type it might not be.
    buyingRole as never,
    influence,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]!.code };
  revalidatePath(`/pipeline/${opportunityId}`);
  revalidatePath(`/account/${accountId}`);
  return { ok: true };
}
