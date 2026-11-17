import { redirect } from "next/navigation";
import { EmptyState } from "@vxture/design-ui";
import { StrategyWorkspace, type StrategyTab } from "../components/strategy-workspace";
import { strategyWorkspaceData } from "./workspace-data";
import { lockedPage } from "../components/locked-page";
import { getMessages } from "../lib/i18n/server";
import { loadFailureText } from "../lib/load-failure";
import { legacyMarketDestination } from "../lib/market-route";

export const dynamic = "force-dynamic";
export default async function StrategyPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  const destination = legacyMarketDestination(values);
  if (destination) redirect(destination);
  const bundle = await strategyWorkspaceData();
  if (!bundle) return null;
  const {view:requested} = values;
  const {data,session} = bundle;
  const view: StrategyTab = requested === "validation" ? "validation" : "overview";
  const locked = lockedPage(session, "strategy");
  if (locked) return locked;
  const read = bundle.plansRead;
  if (!read.ok) {
    const {SHELL_TEXT,LOAD_ERROR} = await getMessages();
    return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(read.violations,LOAD_ERROR)}/>;
  }
  return <StrategyWorkspace key={view} data={data} view={view}/>;
}
