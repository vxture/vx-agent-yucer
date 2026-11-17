import { redirect } from "next/navigation";
import { EmptyState } from "@vxture/design-ui";
import { StrategyWorkspace, type StrategyTab } from "../components/strategy-workspace";
import { strategyWorkspaceData } from "./workspace-data";
import { lockedPage } from "../components/locked-page";
import { getMessages } from "../lib/i18n/server";
import { loadFailureText } from "../lib/load-failure";

export const dynamic = "force-dynamic";
export default async function StrategyPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  if (values.view === "markets") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (key === "view") continue;
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
    }
    redirect(`/segment${query.size ? `?${query}` : ""}`);
  }
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
