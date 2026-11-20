import { PageCrumbs } from "../../components/page-crumbs";
import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { focusHref, focusQuery } from "../../lib/focus-workspace";
import { focusContext } from "../context";
import { readFocusDetail } from "../../../domains/planning/focus-read";
import { PlanError } from "../../../domains/planning/plan-values";
import { FocusDetailView } from "../detail";
import { listPipeline } from "../../../domains/pipeline/service";
import { can } from "../../../authz/decide";
export const dynamic = "force-dynamic";
export default async function FocusDetailPage({ params, searchParams }: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const session = await resolveAppSession();
  if (!session) return null;
  const { FOCUS_TEXT: T, PLAN_VERSION_ERROR: E, DOMAIN_LABEL } = await getMessages();
  const query = focusQuery(await searchParams), { id } = await params;
  if (!query) return <EmptyState title={E.invalid_period}/>;
  try {
    const data = await readFocusDetail(focusContext(session), { ...query, accountId: id });
    const range = data.workspace.periods.find(p => p.key === data.workspace.period)!;
    const canPipeline = can(session.authz, session.entitlement, "pipeline.view", "data").allowed;
    const deals = canPipeline ? await relatedPipeline({ workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement, store: session.stores.pipeline() }, id) : null;
    const opportunities = deals?.ok ? deals.value.filter(d => {
      const date = d.status === "open" ? d.expectedCloseAt : d.closedAt;
      return date && date.toISOString().slice(0, 10) >= range.start && date.toISOString().slice(0, 10) < range.end;
    }).map(d => ({ id: d.id, name: d.name, status: d.status, amount: d.amount?.amount ?? null, currency: d.currency, date: (d.status === "open" ? d.expectedCloseAt : d.closedAt)!.toISOString().slice(0,10) })) : [];
    let pipelineState: "ready" | "failed" | "denied" = "denied";
    if (canPipeline) pipelineState = deals?.ok ? "ready" : "failed";
    return <ViewLayout><PageCrumbs trail={[{ label: DOMAIN_LABEL.namedAccount, href: focusHref({ ...data.workspace, revisionId: data.workspace.revision?.id }) }]} current={data.row.name}/><FocusDetailView key={`${data.workspace.revision?.id}:${data.workspace.editToken}:${data.workspace.eventNo}`} {...data} opportunities={opportunities} pipelineState={pipelineState}/></ViewLayout>;
  } catch (e) { return <EmptyState title={T.notFound} description={E[e instanceof PlanError ? e.code : "source_read_failed"] ?? T.error}/>; }
}

async function relatedPipeline(ctx: Parameters<typeof listPipeline>[0], accountId: string) {
  try { return await listPipeline(ctx, { accountId }); }
  catch { return null; } // Keep deployment readable while live evidence is unavailable.
}
