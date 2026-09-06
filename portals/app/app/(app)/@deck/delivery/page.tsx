import { resolveAppSession } from "../../lib/session";
import { getDeliveryStore } from "../../../domains/shared/registry";
import { listProjects, projectView } from "../../../domains/delivery/service";
import { analyseDelivery } from "../../../domains/delivery/lib/delivery-advice";
import { can } from "../../../authz/decide";
import { AgentCapture } from "../../components/agent-capture";
import { DeliveryAdvicePanel } from "../../components/delivery-advice-panel";
import { reconcileHealth } from "../../delivery/actions";
import { deckBundle, recordAction } from "../deck-data";

// The delivery module's dock - the assistant, then the check that belongs to
// this page.
//
// IT READS THE SAME WAY THE PAGE DOES, one projectView per project, because
// the derived health and the milestones both live on the view rather than on
// the project row. A second read path could disagree with the table beside it.

export const dynamic = "force-dynamic";

export default async function DeliveryDeck() {
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

  const today = new Date();
  const rows = [];
  for (const p of projects.value) {
    const view = await projectView(ctx, p.id);
    const milestones = view.ok ? view.value.milestones : [];
    rows.push({
      id: p.id,
      name: p.name,
      status: p.status,
      reported: p.health,
      derived: view.ok ? view.value.derivedHealth : p.health,
      managerSub: p.managerSub,
      contractAmount: p.contractAmount?.amount ?? null,
      // LATE IS THE CALENDAR'S WORD, not a status: a milestone past its date
      // and not completed is late whether or not anybody moved it.
      lateMilestones: milestones.filter(
        (m) => m.status !== "done" && m.dueAt !== null && m.dueAt < today,
      ).length,
      milestoneCount: milestones.length,
    });
  }

  return (
    <div className="flex flex-col gap-sm">
      {capture}
      <DeliveryAdvicePanel
        advice={analyseDelivery(rows)}
        canWrite={
          can(session.authz, session.entitlement, "delivery.project.upsert", "ui").allowed
        }
        onReconcile={reconcileHealth}
      />
    </div>
  );
}
