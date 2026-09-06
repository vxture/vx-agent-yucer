import { resolveAppSession } from "../../lib/session";
import { getDeliveryStore } from "../../../domains/shared/registry";
import { listProjects, projectView } from "../../../domains/delivery/service";
import { analyseCollections } from "../../../domains/delivery/lib/collection-advice";
import { can } from "../../../authz/decide";
import { AgentCapture } from "../../components/agent-capture";
import { CollectionAdvicePanel } from "../../components/collection-advice-panel";
import { moveInstalment } from "../../delivery/actions";
import { deckBundle, recordAction } from "../deck-data";

// The collections module's dock - the assistant, then the check that belongs
// to this page.
//
// IT READS THE SAME WAY THE PAGE DOES, one projectView per project, because
// the instalments live on the view rather than on the project row. A second
// read path could disagree with the table beside it, and a dock that
// contradicts the rows it points at is worse than no dock.

export const dynamic = "force-dynamic";

export default async function CollectionDeck() {
  const [bundle, session] = await Promise.all([deckBundle(), resolveAppSession()]);
  if (!bundle || !session) return null;

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getDeliveryStore(),
  };

  const capture = (
    <AgentCapture data={bundle.agent} canRecord={bundle.canRecord} onRecord={recordAction("")} />
  );

  const projects = await listProjects(ctx);
  if (!projects.ok) return <div className="flex flex-col gap-sm">{capture}</div>;

  const rows = [];
  for (const p of projects.value) {
    const view = await projectView(ctx, p.id);
    if (!view.ok) continue;
    for (const inst of view.value.instalments) {
      rows.push({
        id: inst.id,
        projectId: p.id,
        projectName: p.name,
        status: inst.status as string,
        plannedAmount: inst.plannedAmount.amount,
        actualAmount: inst.actualAmount?.amount ?? null,
        dueAt: inst.dueAt ? inst.dueAt.toISOString().slice(0, 10) : null,
      });
    }
  }

  return (
    <div className="flex flex-col gap-sm">
      {capture}
      <CollectionAdvicePanel
        advice={analyseCollections(rows, new Date())}
        canWrite={
          can(session.authz, session.entitlement, "delivery.revenue.upsert", "ui").allowed
        }
        onFlag={moveInstalment}
      />
    </div>
  );
}
