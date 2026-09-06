import { resolveAppSession } from "../../lib/session";
import { previewCategories } from "../../../domains/pipeline/service";
import { can } from "../../../authz/decide";
import { AgentCapture } from "../../components/agent-capture";
import { ForecastAdvicePanel } from "../../components/forecast-advice-panel";
import { applySuggestedCategory } from "../../forecast/actions";
import { deckBundle, recordAction } from "../deck-data";

// The forecast-rule module's dock - the assistant, then the disagreements.
//
// ONE READ, THE SAME ONE THE PAGE MAKES. `previewCategories` already returns a
// verdict per deal; the dock filters it to the ones that disagree rather than
// deriving anything of its own, so the panel and the table cannot fall out of
// step with each other.

export const dynamic = "force-dynamic";

export default async function ForecastDeck() {
  const [bundle, session] = await Promise.all([deckBundle(), resolveAppSession()]);
  if (!bundle || !session) return null;

  const capture = (
    <AgentCapture data={bundle.agent} canRecord={bundle.canRecord} onRecord={recordAction("")} />
  );

  const preview = await previewCategories({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  });
  if (!preview.ok) return <div className="flex flex-col gap-sm">{capture}</div>;

  const items = preview.value
    .filter((p) => p.verdict.kind === "suggested" && !p.verdict.agrees)
    .map((p) => ({
      opportunityId: p.opportunity.id,
      opportunityNo: p.opportunity.opportunityNo,
      dealName: p.opportunity.name,
      filed: p.opportunity.forecastCategory,
      suggested: (p.verdict as { category: typeof p.opportunity.forecastCategory }).category,
    }));

  return (
    <div className="flex flex-col gap-sm">
      {capture}
      <ForecastAdvicePanel
        items={items}
        canApply={
          can(session.authz, session.entitlement, "pipeline.forecast.categorize", "ui").allowed
        }
        onApply={applySuggestedCategory}
      />
    </div>
  );
}
