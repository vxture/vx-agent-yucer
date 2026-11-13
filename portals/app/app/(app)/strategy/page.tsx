import { redirect } from "next/navigation";
import { EmptyState } from "@vxture/design-ui";
import { StrategyWorkspace, type StrategyTab } from "../components/strategy-workspace";
import { strategyWorkspaceData } from "./workspace-data";
import { lockedPage } from "../components/locked-page";
import { getMessages } from "../lib/i18n/server";
import { loadFailureText } from "../lib/load-failure";

export const dynamic = "force-dynamic";
export default async function StrategyPage({ searchParams }: { readonly searchParams: Promise<{view?:string}> }) {
  const bundle = await strategyWorkspaceData();
  if (!bundle) return null;
  const {view:requested} = await searchParams;
  const {data,session} = bundle;
  const view: StrategyTab = requested === "markets" ? "markets" : requested === "validation" ? "validation" : "overview";
  if (!requested && !data.canPlan && data.canMarkets) redirect("/strategy?view=markets");
  const locked = lockedPage(session, view === "markets" ? "segment" : "strategy");
  if (locked) return locked;
  const read = view === "markets" ? bundle.marketsRead : bundle.plansRead;
  if (!read.ok) {
    const {SHELL_TEXT,LOAD_ERROR} = await getMessages();
    return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(read.violations,LOAD_ERROR)}/>;
  }
  return <StrategyWorkspace key={view} data={data} view={view}/>;
}
