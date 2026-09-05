import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getDeliveryStore } from "../../../domains/shared/registry";
import { listProjects, projectView } from "../../../domains/delivery/service";
import { MilestoneForm } from "../../components/milestone-form";
import { saveMilestone } from "../actions";

// 录入里程碑 - a page since 2026-09-05 (owner ruling; see /catalog/new for the
// shape and why the gate redirects). Milestones are read per project through
// projectView, the same gated path the list page uses.

export const dynamic = "force-dynamic";

export default async function NewMilestonePage() {
  const { SHELL_TEXT, DELIVERY_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "delivery.milestone.upsert", "ui").allowed) {
    redirect("/delivery");
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getDeliveryStore(),
  };
  const projects = await listProjects(ctx, {});
  const rows = projects.ok ? projects.value : [];

  const milestones: { projectId: string; sequence: number }[] = [];
  for (const p of rows) {
    const view = await projectView(ctx, p.id);
    if (!view.ok) continue;
    for (const m of view.value.milestones) {
      milestones.push({ projectId: p.id, sequence: m.sequence });
    }
  }

  return (
    <ViewLayout>
      <ViewHeader title={DELIVERY_TEXT.milestonesTitle} description={DELIVERY_TEXT.milestonesWhy} />
      <MilestoneForm
        milestones={milestones}
        projects={rows.map((p) => ({ id: p.id, name: p.name, status: p.status }))}
        onSave={saveMilestone}
      />
    </ViewLayout>
  );
}
