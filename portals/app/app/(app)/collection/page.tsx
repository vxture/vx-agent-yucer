import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getDeliveryStore } from "../../domains/shared/registry";
import { listProjects, projectView } from "../../domains/delivery/service";
import {
  CollectionsPanel,
  type CollectionRow,
} from "../components/collections-panel";
import { moveInstalment } from "../delivery/actions";
import { loadFailureText } from "../lib/load-failure";

// D7 collections - a module page since 2026-08-30.
//
// One projectView per project, the same shape /delivery uses. It is an N+1 and
// it is deliberate here: the instalments live on the view, not on the project
// row, and at this catalogue's size the alternative would be a second read
// path that can disagree with the one /delivery already runs.
//
// The overdue subset is FILTERED from the rows on screen rather than read
// again, so the count and the list can never contradict each other.

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const { DELIVERY_TEXT, LOAD_ERROR, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getDeliveryStore(),
  };

  const projects = await listProjects(ctx);
  if (!projects.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(projects.violations, LOAD_ERROR)}
      />
    );
  }

  const rows: CollectionRow[] = [];
  for (const p of projects.value) {
    const view = await projectView(ctx, p.id);
    if (!view.ok) continue;
    for (const inst of view.value.instalments) {
      rows.push({
        id: inst.id,
        projectId: p.id,
        projectName: p.name,
        sequence: inst.sequence,
        status: inst.status,
        plannedAmount: inst.plannedAmount.amount,
        actualAmount: inst.actualAmount?.amount ?? null,
        currency: inst.plannedAmount.currency,
        dueAt: inst.dueAt ? inst.dueAt.toISOString().slice(0, 10) : null,
      });
    }
  }

  return (
    <ViewLayout>
      <ViewHeader
        title={DELIVERY_TEXT.collections}
        description={DELIVERY_TEXT.collectionsWhy}
      />
      <CollectionsPanel
        rows={rows}
        overdue={rows.filter((c) => c.status === "overdue").length}
        canWrite={
          can(
            session.authz,
            session.entitlement,
            "delivery.revenue.upsert",
            "ui",
          ).allowed
        }
        onMove={moveInstalment}
      />
    </ViewLayout>
  );
}
