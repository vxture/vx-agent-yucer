import { can } from "../../authz/decide";
import { getAuthzStore } from "../../authz/store";
import { scopeAccountStore,scopePipelineStore } from "../../authz/scoped-stores";
import { resolveDataScope } from "../../(app)/lib/resolve-scope";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { readProductRoster } from "../../platform/product-roster";
import { getAccountStore,getPipelineStore } from "../shared/registry";
import { dailyJudgementBaseline, hasDailyJudgementBaseline } from "./daily-baseline";
import { topicFeed } from "./topic-feed";
import { createHash } from "node:crypto";
/** Background local rule evaluation with current member permissions. It never
 * mints/retains user OBO tokens, reads private chats or invokes a model. */
export async function runDailyJudgements(workspaces:readonly string[],now=new Date()) {
  const ledger={generated:0,skipped:0,failed:0};
  for(const workspaceId of workspaces){
    try {
      const [entitlement,roster,members]=await Promise.all([getEntitlementResolver().resolve(workspaceId),readProductRoster(workspaceId),getAuthzStore().listMembers(workspaceId)]);
      if(roster===null){ledger.skipped++;continue;}
      for(const member of members.filter(m=>m.status==="active" && roster.some(r=>r.subject===m.sub))){
        try {
          const permissions=await getAuthzStore().permissionsOf(workspaceId,member.sub),holder={permissions:new Set(permissions)};
          if(!can(holder,entitlement,"copilot.ask","data").allowed || !can(holder,entitlement,"account.view","data").allowed){ledger.skipped++;continue;}
          const scope=await resolveDataScope(workspaceId,member.sub,getAuthzStore());
          const accessVersion=createHash("sha256").update(JSON.stringify({permissions:[...permissions].sort((a,b)=>a.localeCompare(b)),scope,tier:entitlement.tier,bundled:entitlement.bundled})).digest("hex");
          const ctx={workspaceId,sub:member.sub,holder,entitlement,allowWorkspaceMetrics:scope.kind==="workspace",stores:{account:()=>scopeAccountStore(getAccountStore(),scope),pipeline:()=>scopePipelineStore(getPipelineStore(),scope,member.sub)}};
          // Build both explicitly selectable scopes with their original service
          // rules. Non-workspace members remain restricted by scoped stores.
          for(const selected of ["mine","all"] as const){
            if(await hasDailyJudgementBaseline({...ctx,accessVersion},selected,now)){ledger.skipped++;continue;}
            const feed=await topicFeed(ctx,{scope:selected,now});
            if(feed.ok){await dailyJudgementBaseline({...ctx,accessVersion},feed.value,now);ledger.generated++;}
          }
        }catch{ledger.failed++;}
      }
    }catch{ledger.failed++;}
  }
  return ledger;
}
