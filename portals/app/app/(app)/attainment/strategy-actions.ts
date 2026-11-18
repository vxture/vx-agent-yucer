"use server";
import { revalidatePath } from "next/cache";
import { can } from "../../authz/decide";
import { resolveAppSession } from "../lib/session";
import { getSalesPlanStore } from "../../domains/shared/registry";
import { planVersions } from "../../domains/planning/plan-state";
import { demand, PlanError } from "../../domains/planning/plan-values";
import { listStrategicResults, validateStrategicResult, appendStrategicResult, type StrategicResult } from "../../domains/planning/strategic-results";
export async function recordStrategicResult(input: { id:string; year:number; revisionId:string; acceptanceKey:string; allocationKey:string; achievedOn:string; evidenceUrl:string; note:string; voidsId?:string }) {
  const s = await resolveAppSession(); if (!s) return {ok:false,error:"not_authenticated"};
  try {
    demand(s.scope.kind === "workspace" && ["planning.target.update", "planning.attainment.view", "strategy.plan.view"].every(permission => can(s.authz,s.entitlement,permission as "planning.target.update","data").allowed), "plan_denied");
    demand(Number.isInteger(input.year) && input.year >= 2000 && input.year <= 2200, "invalid_period");
    const plan = await getSalesPlanStore().read(s.workspaceId,input.year);
    const current = plan && planVersions(plan,new Date().toISOString()).current;
    const previous = await listStrategicResults(s.workspaceId);
    const original = input.voidsId ? previous.find(e => e.id === input.voidsId) : null;
    const r = original ? plan?.revisions.find(r => r.id === original.revisionId && r.state === "sealed") : current;
    const x = r?.content.strategyAcceptances?.find(x => x.key === input.acceptanceKey);
    const a = x?.allocations.find(a => a.key === input.allocationKey);
    demand(plan && r && x && a && r.id === input.revisionId, "strategy_source_changed");
    const row: StrategicResult = { id:input.id,workspaceId:s.workspaceId,planId:plan.id,revisionId:r.id,acceptanceKey:x.key,lineageId:x.lineageId,objectiveId:x.expectation.id,allocationKey:a.key,regionId:a.regionId,
      achievedOn:original?.achievedOn ?? input.achievedOn,evidenceUrl:original?.evidenceUrl ?? input.evidenceUrl.trim(),note:input.note.trim(),actorSub:s.user.sub,recordedAt:new Date().toISOString(),voidsId:input.voidsId ?? null };
    const retry = previous.find(e => e.id === row.id);
    if (retry) { demand(JSON.stringify({...retry,recordedAt:null}) === JSON.stringify({...row,recordedAt:null}), "strategy_result_conflict"); return {ok:true}; }
    validateStrategicResult(row,r.content,x,previous);
    await appendStrategicResult(row);
    revalidatePath("/attainment"); revalidatePath("/strategy","layout"); revalidatePath("/planning"); return {ok:true};
  } catch(error) { return {ok:false,error:error instanceof PlanError ? error.code : "strategy_result_invalid"}; }
}
