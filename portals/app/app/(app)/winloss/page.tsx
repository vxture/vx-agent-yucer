import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { winLossWorkspace } from "../../domains/pipeline/service";
import { filterWinLossRows, summarizeWinLoss, winLossRows } from "../../domains/pipeline/lib/winloss-workspace";
import { resolveWinLossQuery, type WinLossQuery } from "../lib/winloss-workspace";
import { PendingReviews, WinLossViews } from "../components/pending-reviews";
import { loadFailureText } from "../lib/load-failure";
import { lockedPage } from "../components/locked-page";
import { listTerritories } from "../../domains/planning/service";
import { getPlanningStore } from "../../domains/shared/registry";
import { can } from "../../authz/decide";

export const dynamic = "force-dynamic";
export default async function WinLossPage({ searchParams }: { readonly searchParams: Promise<WinLossQuery> }) {
  const session = await resolveAppSession();
  if (!session) return null;
  const locked = lockedPage(session, "winLossReview");
  if (locked) return locked;
  const { LOAD_ERROR, SHELL_TEXT, WINLOSS_WORKSPACE_TEXT: T } = await getMessages();
  const filter = resolveWinLossQuery(await searchParams);
  if (!filter) return <EmptyState title={T.failed}/>;
  const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const [read, regions] = await Promise.all([
    winLossWorkspace({ ...base, store: session.stores.pipeline() }),
    listTerritories({ ...base, store: getPlanningStore() }, { includeRetired: true }),
  ]);
  if (!read.ok) return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(read.violations, LOAD_ERROR)}/>;
  const all = winLossRows(read.value.closed, read.value.reviews, read.value.reasons);
  const rows = filterWinLossRows(all, filter);
  const regionIds = new Set(all.map(r => r.regionId));
  const summary = summarizeWinLoss(rows);
  const dated = filterWinLossRows(all, { ...filter, dates: "period", status: "all", reason: "" });
  const undated = filterWinLossRows(all, { ...filter, dates: "undated", status: "all", reason: "" }).length;
  const years = [...new Set([Number(filter.period.replace(/^Y/, "").slice(0,4)), new Date().getUTCFullYear(), ...all.flatMap(r => r.closedAt ? [Number(r.closedAt.slice(0,4))] : [])])].sort((a,b) => b-a);
  return <ViewLayout className="pb-3xl">
    <ModuleHeadline moduleKey="winLossReview" brief="winloss" help={T.help} pageActions={{ view: <WinLossViews filter={filter}/> }}/>
    <PendingReviews key={`${session.workspaceId}|${session.user.sub}|${JSON.stringify(filter)}`} rows={rows} summary={summary} filter={filter}
      datedCount={dated.length} undatedCount={undated} years={years}
      reasons={read.value.reasons.map(r => ({ id: r.id, name: r.name }))}
      regions={(regions.ok ? regions.value : []).filter(r => regionIds.has(r.id)).map(r => ({ id:r.id, name:r.name }))}
      canPlan={session.scope.kind === "workspace" && can(session.authz, session.entitlement, "planning.target.view", "ui").allowed}/>
  </ViewLayout>;
}
