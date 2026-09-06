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
import { CollectionOverview } from "../components/collection-overview";
import { collectionStats } from "../../domains/delivery/lib/collection-stats";
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
  const { DELIVERY_TEXT, LOAD_ERROR, REVENUE_STATUS_LABEL, SHELL_TEXT } = await getMessages();
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
  // THE BREAKDOWN IS THE COLLECTION PROCESS, not the project list (owner,
  // 2026-09-06). This page is about where the money has got to on its way in:
  // planned, invoiced, late, arrived, given up on. A per-project breakdown
  // answered "who owes us", which the table below already lists row by row,
  // and said nothing about the stage a receivable is stuck at - which is the
  // question a collections review opens with.
  //
  // SETTLED IS COUNTED AT WHAT ARRIVED, everything else at what was promised.
  // Summing the planned figure for money that is already in would report a
  // number nobody received, and short payment is normal enough here that the
  // schedule tracks it separately from invoicing.
  const STAGES = ["planned", "invoiced", "overdue", "settled", "written_off"] as const;
  // THE COLOUR IS THE STAGE'S MEANING, not a palette position: overdue is the
  // product's danger, settled its success, a write-off is muted because it is
  // over. The dot beside the number and that stage's share of the bar above
  // are the same colour, which is what lets the two readings be one reading.
  const STAGE_TONE = {
    planned: "neutral",
    invoiced: "info",
    overdue: "danger",
    settled: "success",
    written_off: "muted",
  } as const;
  const stats: HeadlineStat[] = STAGES.map((stage) => {
    const at = rows.filter((r) => r.status === stage);
    const amount = at.reduce(
      (sum, r) => sum + (stage === "settled" ? (r.actualAmount ?? 0) : r.plannedAmount),
      0,
    );
    return {
      key: stage,
      name: REVENUE_STATUS_LABEL[stage] ?? stage,
      value: amount,
      note: DELIVERY_TEXT.collectStatCount(at.length),
      tone: STAGE_TONE[stage],
    };
  }).filter((cell) => cell.value > 0);

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
        share
        emptyNote={DELIVERY_TEXT.collectStatEmpty}
      />
      {/* 统计为主，列表为具体清单 (owner, 2026-09-06) - so the shape comes
          first and the schedule reads as its detail. Both are computed from
          the SAME rows, so the block and the list cannot disagree. */}
      <CollectionOverview stats={collectionStats(rows, new Date())} />
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
