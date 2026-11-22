import { Banner } from "@vxture/design-ui";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { resolveAppSession } from "../lib/session";
import { XiaoyuWorkspace } from "../components/xiaoyu-workspace";
import LegacyCopilotPage from "./legacy-page";

export const dynamic = "force-dynamic";
type Query = { task?: string; view?: string; account?: string; ask?: string; opportunity?: string; mode?: string; thread?: string };
export default async function CopilotPage({ searchParams }: { readonly searchParams: Promise<Query> }) {
  const query = await searchParams;
  if (query.view === "proposals" || query.account || query.opportunity || query.thread || query.ask || query.mode) {
    return <LegacyCopilotPage searchParams={Promise.resolve(query)} />;
  }
  const session = await resolveAppSession();
  if (!session) return null;
  if (!can(session.authz, session.entitlement, "copilot.ask", "ui").allowed) {
    const { XIAOYU_TEXT: T } = await getMessages();
    return <Banner tone="warning" title={T.accessChanged} />;
  }
  return <XiaoyuWorkspace initialTask={query.task} />;
}
