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

export default async function NewMilestonePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ project?: string }>;
}) {
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

  // NAME AND DATE COME TOO, not just the key. The form needs to know whether
  // the gate at this (project, sequence) already exists AND whether the values
  // being typed move it - moving a committed gate needs a reason, and asking
  // for one only when the plan actually differs is the difference between a
  // rule and a nuisance.
  const milestones: {
    projectId: string;
    sequence: number;
    name: string;
    dueAt: string | null;
    status: string;
    completedAt: string | null;
    acceptedBy: string | null;
    acceptedAt: string | null;
  }[] = [];
  for (const p of rows) {
    const view = await projectView(ctx, p.id);
    if (!view.ok) continue;
    for (const m of view.value.milestones) {
      milestones.push({
        projectId: p.id,
        sequence: m.sequence,
        name: m.name,
        // Same yyyy-mm-dd the date input speaks, so the comparison is between
        // two strings of one shape rather than a Date against a form value.
        dueAt: m.dueAt ? m.dueAt.toISOString().slice(0, 10) : null,
        // THE WHOLE GATE, not the half the reason field compares. An edit form
        // that loads only the fields it asks about writes DEFAULTS over the
        // rest - the first edit through this page reset a gate from 进行中 back
        // to 未开始 because the status select still held its initial value.
        status: m.status,
        completedAt: m.completedAt ? m.completedAt.toISOString().slice(0, 10) : null,
        acceptedBy: m.acceptance?.by ?? null,
        acceptedAt: m.acceptance ? m.acceptance.at.toISOString().slice(0, 10) : null,
      });
    }
  }

  return (
    <ViewLayout>
      <ViewHeader title={DELIVERY_TEXT.milestonesTitle} description={DELIVERY_TEXT.milestonesWhy} />
      <MilestoneForm
        initialProjectId={(await searchParams).project}
        milestones={milestones}
        projects={rows.map((p) => ({ id: p.id, name: p.name, status: p.status }))}
        onSave={saveMilestone}
      />
    </ViewLayout>
  );
}
