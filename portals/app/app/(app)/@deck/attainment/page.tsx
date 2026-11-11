import { can } from "../../../authz/decide";
import { canRunAdvisor } from "../../../domains/copilot/lib/advisor-gate";
import { FORECAST_BRIEF_CAPABILITY } from "../../../domains/copilot/lib/forecast-brief";
import { resolveAppSession } from "../../lib/session";
import { resolveAttainmentQuery, type AttainmentQuery } from "../../lib/attainment-workspace";
import { ForecastAdvicePanel } from "../../components/forecast-advice-panel";
import { ForecastBriefPanel } from "../../components/forecast-brief";
import { AgentPanel } from "../../components/agent-panel";
import { applySuggestedCategory } from "../../forecast/actions";
import { briefForecast } from "../../forecast/brief-action";
import { loadForecastWorkspace } from "../../attainment/board";
import { deckBundle, recordAction } from "../deck-data";

export const dynamic = "force-dynamic";

export default async function AttainmentDeck({ searchParams }: { searchParams: Promise<AttainmentQuery> }) {
  const [session, bundle] = await Promise.all([resolveAppSession(), deckBundle()]);
  if (!session || !bundle) return null;
  const selected = resolveAttainmentQuery(await searchParams, session.user.sub);
  const canView = can(session.authz, session.entitlement, "pipeline.forecast.view", "ui").allowed;
  const board = selected.period !== "all" && selected.view === "review" && canView ? await loadForecastWorkspace(selected.period, selected.scopeKey) : null;
  const items = board?.ok ? board.inView.flatMap((p) => p.verdict.kind === "suggested" && !p.verdict.agrees ? [{
    opportunityId: p.opportunity.id, opportunityNo: p.opportunity.opportunityNo, dealName: p.opportunity.name,
    filed: p.opportunity.forecastCategory, suggested: p.verdict.category,
  }] : []) : [];
  const advisor = board?.ok ? <div className="flex min-w-0 flex-col gap-sm">
    {canRunAdvisor(session.authz, session.entitlement, FORECAST_BRIEF_CAPABILITY, "ui").allowed ? <ForecastBriefPanel key={`${selected.period}|${selected.scopeKey}`} period={selected.period} scopeKey={selected.scopeKey} onBrief={briefForecast} /> : null}
    <ForecastAdvicePanel items={items} canApply={can(session.authz, session.entitlement, "pipeline.forecast.categorize", "ui").allowed} onApply={applySuggestedCategory} />
  </div> : null;
  return <AgentPanel data={bundle.agent} canRecord={bundle.canRecord} canAsk={bundle.canAsk} onRecord={recordAction("")} decisions={false} advisor={advisor} />;
}
