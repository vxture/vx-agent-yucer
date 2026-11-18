import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { PageCrumbs } from "../../components/page-crumbs";
import { StrategyOptionConfig } from "../../components/strategy-option-config";
import { StrategyTypeConfig } from "../../components/strategy-type-config";
import { getStrategyStore } from "../../../domains/shared/registry";
import { listStrategyOptions, listStrategyTypes } from "../../../domains/strategy/type-service";
import { can } from "../../../authz/decide";
import { saveStrategyOptionAction, saveStrategyTypeAction } from "./actions";

export const dynamic="force-dynamic";

export default async function StrategySettingsPage() {
  const session=await resolveAppSession();
  if(!session)return null;
  const {MARKET_STRATEGY_TEXT:T,ADMIN_TEXT}=await getMessages();
  const result=await listStrategyTypes({workspaceId:session.workspaceId,sub:session.user.sub,
    holder:session.authz,entitlement:session.entitlement,store:getStrategyStore()});
  if(!result.ok)return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription}/>;
  const options=await listStrategyOptions({workspaceId:session.workspaceId,sub:session.user.sub,holder:session.authz,entitlement:session.entitlement,store:getStrategyStore()});
  return <ViewLayout>
    <PageCrumbs trail={[{label:ADMIN_TEXT.title,href:"/admin"}]} current={T.typeConfig}/>
    <StrategyTypeConfig rows={result.value} editable={can(session.authz,session.entitlement,"strategy.type.update","ui").allowed} onSave={saveStrategyTypeAction}/>
    {options.ok?<StrategyOptionConfig rows={options.value} editable={can(session.authz,session.entitlement,"strategy.type.update","ui").allowed} onSave={saveStrategyOptionAction}/>:null}
  </ViewLayout>;
}
