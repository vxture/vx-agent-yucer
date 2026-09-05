import { resolveAppSession } from "../../lib/session";
import { can } from "../../../authz/decide";
import { getCatalogStore } from "../../../domains/shared/registry";
import { analysePriceBook } from "../../../domains/catalog/service";
import { AgentCapture } from "../../components/agent-capture";
import { PriceAdvicePanel } from "../../components/price-advice-panel";
import { savePrice } from "../../catalog/actions";
import { deckBundle, recordAction } from "../deck-data";

// The price book's own dock - owner ruling 2026-09-05: keep the conversation
// at the top, drop the workspace-wide queues below it, and put the price
// analysis there instead.
//
// The queues are not wrong, they are elsewhere's: "今天要定的" and the recon
// block answer how the workspace is doing, which is the question a first-level
// page asks. Beside the price book the question is what these floors imply,
// and that is what this dock answers.
//
// SEARCH PARAMS ARE THE BRIDGE. The table lives in a different React tree (a
// parallel route), so a selection cannot be handed across as state; it
// arrives as `?analyze=`, which the table writes and this deck reads. That
// also makes an analysis a place you can link to.

export const dynamic = "force-dynamic";

export default async function PricebookDeck({
  searchParams,
}: {
  readonly searchParams: Promise<{ analyze?: string }>;
}) {
  const [bundle, session, params] = await Promise.all([
    deckBundle(),
    resolveAppSession(),
    searchParams,
  ]);
  if (!bundle || !session) return null;

  const selection =
    params.analyze && params.analyze !== "all"
      ? params.analyze.split(",").filter(Boolean)
      : undefined;

  const advice = await analysePriceBook(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getCatalogStore(),
    },
    { productIds: selection },
  );

  return (
    <div className="flex flex-col gap-sm">
      <AgentCapture
        data={bundle.agent}
        canRecord={bundle.canRecord}
        onRecord={recordAction("")}
      />
      {advice.ok ? (
        <PriceAdvicePanel
          advice={advice.value}
          scope={selection ? "selection" : "all"}
          canPrice={
            can(session.authz, session.entitlement, "catalog.pricebook.upsert", "ui").allowed
          }
          onApply={savePrice}
        />
      ) : null}
    </div>
  );
}
