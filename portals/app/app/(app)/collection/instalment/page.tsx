import { ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getDeliveryStore } from "../../../domains/shared/registry";
import { listProjects, projectView } from "../../../domains/delivery/service";
import { InstalmentForm } from "../../components/instalment-form";
import { createInstalmentAction } from "./actions";

// 新增回款期次 - the collection plan's own entry form. The page could only move
// instalments that already existed. ?project=X presets the project (the same
// way the milestone form is reached from a project row). Gate: delivery.revenue.upsert.

export const dynamic = "force-dynamic";

export default async function NewInstalmentPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ project?: string }>;
}) {
  const { DOMAIN_LABEL, DELIVERY_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  if (!can(session.authz, session.entitlement, "delivery.revenue.upsert", "ui").allowed) redirect("/collection");

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getDeliveryStore(),
  };
  const projects = await listProjects(ctx, {});
  // A closed or cancelled project takes no new money.
  const open = (projects.ok ? projects.value : []).filter((p) => p.status !== "closed" && p.status !== "cancelled");
  const gates: { id: string; projectId: string; name: string; sequence: number }[] = [];
  for (const p of open) {
    const view = await projectView(ctx, p.id);
    if (!view.ok) continue;
    for (const m of view.value.milestones) gates.push({ id: m.id, projectId: p.id, name: m.name, sequence: m.sequence });
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: DOMAIN_LABEL.collection, href: "/collection" }]}
        current={DELIVERY_TEXT.newInstalment}
      />
      <ViewHeader title={DELIVERY_TEXT.newInstalment} description={DELIVERY_TEXT.instalmentWhy} />
      <InstalmentForm
        projects={open.map((p) => ({ id: p.id, name: p.name, currency: p.currency }))}
        milestones={gates}
        initialProjectId={(await searchParams).project}
        onCreate={createInstalmentAction}
      />
    </ViewLayout>
  );
}
