import { Banner } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { resolveAppSession } from "../lib/session";
import { XiaoyuWorkspace } from "../components/xiaoyu-workspace";
import LegacyCopilotPage from "./legacy-page";
import { WorkspaceContent } from "../components/workspace-layout";

export const dynamic = "force-dynamic";
type Query = { task?: string; scope?: string; view?: string; account?: string; ask?: string; opportunity?: string; mode?: string; thread?: string };
export default async function CopilotPage({ searchParams }: { readonly searchParams: Promise<Query> }) {
  const query = await searchParams;
  if (query.view === "judgements") {
    const next = new URLSearchParams();
    if (query.task) next.set("task", query.task);
    if (query.scope === "mine" || query.scope === "all") next.set("scope", query.scope);
    redirect(`/copilot/today${next.size ? `?${next}` : ""}`);
  }
  if (query.view === "proposals" || query.account || query.opportunity || query.thread || query.ask || query.mode) {
    return <WorkspaceContent><LegacyCopilotPage searchParams={Promise.resolve(query)} /></WorkspaceContent>;
  }
  const session = await resolveAppSession();
  if (!session) return null;
  if (!can(session.authz, session.entitlement, "copilot.ask", "ui").allowed) {
    const { XIAOYU_TEXT: T } = await getMessages();
    return <WorkspaceContent><Banner tone="warning" title={T.accessChanged} /></WorkspaceContent>;
  }
  return <XiaoyuWorkspace initialTask={query.task} />;
}
