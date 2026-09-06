import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getDeliveryStore } from "../../domains/shared/registry";
import { listProjects, projectView } from "../../domains/delivery/service";
import {
  CollectionRoster,
  type CollectionRow,
} from "../components/collection-roster";
import { ModuleHeadline, type HeadlineStat } from "../components/module-headline";
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

  const open = rows.filter((r) => r.status !== "settled" && r.status !== "written_off");
  const overdue = open.filter((r) => r.status === "overdue").length;
  const short = rows.filter(
    (r) => r.status === "settled" && r.actualAmount !== null && r.actualAmount < r.plannedAmount,
  ).length;
  // One cell per project still owed money, the outstanding amount as the
  // number: the breakdown decomposes the headline the way every other
  // module's does, and the dock explains whichever cell looks wrong.
  const byProject = new Map<string, { name: string; amount: number; count: number }>();
  for (const r of open) {
    const cell = byProject.get(r.projectId) ?? { name: r.projectName, amount: 0, count: 0 };
    cell.amount += r.plannedAmount;
    cell.count += 1;
    byProject.set(r.projectId, cell);
  }
  const stats: HeadlineStat[] = [...byProject.entries()].map(([id, c]) => ({
    key: id,
    name: c.name,
    value: c.amount,
    note: DELIVERY_TEXT.collectStatOutstanding(c.count),
  }));

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey="collection"
        description={DELIVERY_TEXT.collectionsWhy}
        tags={
          <>
            <StatusBadge tone="success">{DELIVERY_TEXT.tagCollectDue(open.length)}</StatusBadge>
            {overdue > 0 ? (
              <StatusBadge tone="danger">{DELIVERY_TEXT.tagCollectOverdue(overdue)}</StatusBadge>
            ) : null}
            {short > 0 ? (
              <StatusBadge tone="warning">{DELIVERY_TEXT.tagCollectShort(short)}</StatusBadge>
            ) : null}
          </>
        }
        stats={stats}
        emptyNote={DELIVERY_TEXT.collectStatEmpty}
      />
      <CollectionRoster
        rows={rows}
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
