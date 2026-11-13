import { EmptyState } from "@vxture/design-ui";
import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
import { notFound } from "next/navigation";
import { StrategyWorkspace } from "../../components/strategy-workspace";
import { strategyWorkspaceData } from "../workspace-data";
import { lockedPage } from "../../components/locked-page";
export const dynamic = "force-dynamic";
export default async function StrategyDetail({ params }: { readonly params: Promise<{id:string}> }) {
  const bundle=await strategyWorkspaceData();
  if(!bundle)return null;
  const locked=lockedPage(bundle.session,"strategy");
  if(locked)return locked;
  if (!bundle.plansRead.ok) {
    const {SHELL_TEXT,LOAD_ERROR}=await getMessages();
    return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(bundle.plansRead.violations,LOAD_ERROR)}/>;
  }
  const {id}=await params;
  if(!bundle.data.plans?.some(p=>p.id===id))notFound();
  return <StrategyWorkspace data={bundle.data} view="overview" detailId={id}/>;
}
