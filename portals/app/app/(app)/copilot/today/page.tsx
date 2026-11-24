import { Banner } from "@vxture/design-ui";
import { can } from "../../../authz/decide";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { XiaoyuWorkspace } from "../../components/xiaoyu-workspace";
import { WorkspaceContent } from "../../components/workspace-layout";

export const dynamic = "force-dynamic";
export default async function TodayPage({ searchParams }: { readonly searchParams: Promise<{task?: string}> }) {
  const session = await resolveAppSession();
  if (!session) return null;
  if (!can(session.authz, session.entitlement, "copilot.ask", "ui").allowed) {
    const { XIAOYU_TEXT: T } = await getMessages();
    return <WorkspaceContent><Banner tone="warning" title={T.accessChanged} /></WorkspaceContent>;
  }
  const { task } = await searchParams;
  return <XiaoyuWorkspace initialTask={task} today />;
}
