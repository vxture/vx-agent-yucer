"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getStrategyStore } from "../../../domains/shared/registry";
import { saveStrategyType } from "../../../domains/strategy/type-service";
import type { StrategyType } from "../../../domains/strategy/lib/strategy-type";

export async function saveStrategyTypeAction(input: StrategyType) {
  const session=await resolveAppSession();
  if(!session)return {ok:false,error:"not_authenticated"};
  const result=await saveStrategyType({workspaceId:session.workspaceId,sub:session.user.sub,
    holder:session.authz,entitlement:session.entitlement,store:getStrategyStore()},input);
  if(!result.ok)return {ok:false,error:result.violations[0]?.code ?? "denied"};
  revalidatePath("/admin/strategy");
  revalidatePath("/strategy","layout");
  return {ok:true};
}
