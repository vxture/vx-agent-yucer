import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getDeliveryStore } from "../../domains/shared/registry";
import { ageingCutoffs, listProjects, projectView } from "../../domains/delivery/service";
import {
  CollectionRoster,
  type CollectionRow,
} from "../components/collection-roster";
import { ModuleHeadline } from "../components/module-headline";
import { NewEntryLink } from "../components/form-page";
import { CollectionOverview } from "../components/collection-overview";
import { collectionStats } from "../../domains/delivery/lib/collection-stats";
import { deleteInstalment, moveInstalment } from "../delivery/actions";
import { loadFailureText } from "../lib/load-failure";
import Link from "next/link";
import { getAccountDetail } from "../../domains/account/service";
import { lockedPage } from "../components/locked-page";

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

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { account: accountParam } = await searchParams;
  const { DELIVERY_TEXT, LOAD_ERROR, REVENUE_STATUS_LABEL, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Not bought: the upgrade template in place of the page (owner 2026-09-28).
  const locked = lockedPage(session, "collection");
  if (locked) return locked;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getDeliveryStore(),
  };

  // ONE CUSTOMER'S SCHEDULE (YC-021 回款: 回款状态流转 from the customer page).
  // The customer page's 回款 tab links here with ?account=; the account is
  // resolved through the member's own gate, and an id they cannot read simply
  // does not narrow anything - it never names a customer they cannot see.
  const scopedTo = accountParam
    ? await getAccountDetail(
        { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz,
          entitlement: session.entitlement, store: session.stores.account() },
        accountParam,
      )
    : null;
  const onlyAccount = scopedTo?.ok ? { id: accountParam as string, name: scopedTo.value.account.name } : null;
  const projects = await listProjects(ctx, onlyAccount ? { accountId: onlyAccount.id } : {});
  // incr/0042. The workspace's own ageing policy - the chart below is cut by
  // these, not by two numbers in the build.
  const cutoffs = await ageingCutoffs(ctx);
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
  // The money by where it stands - one bar per stage, the other cut of the
  // same rows the ageing chart and the schedule come from. Zero stages are
  // left out: an empty bar says nothing.
  const STAGES = ["settled", "overdue", "invoiced", "planned", "written_off"] as const;
  const byStatus = STAGES.map((stage) => {
    const at = rows.filter((r) => r.status === stage);
    return {
      key: stage as string,
      label: REVENUE_STATUS_LABEL[stage] ?? stage,
      value: at.reduce(
        (sum, r) => sum + (stage === "settled" ? (r.actualAmount ?? 0) : r.plannedAmount),
        0,
      ),
    };
  }).filter((cell) => cell.value > 0);

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey="collection"
        action={
          can(session.authz, session.entitlement, "delivery.revenue.upsert", "ui").allowed ? (
            <NewEntryLink href="/collection/instalment" label={DELIVERY_TEXT.newInstalment} />
          ) : null
        }
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
      />
      {/* 统计为主，列表为具体清单 (owner, 2026-09-06) - so the shape comes
          first and the schedule reads as its detail. Both are computed from
          the SAME rows, so the block and the list cannot disagree. */}
      {onlyAccount ? (
        <p className="text-muted-foreground text-body-small">
          {DELIVERY_TEXT.collectOnlyAccount(onlyAccount.name)}{" "}
          <Link href="/collection" className="text-primary hover:underline">{DELIVERY_TEXT.collectShowAll}</Link>
        </p>
      ) : null}
      <CollectionOverview
        byStatus={byStatus}
        stats={collectionStats(rows, new Date(), cutoffs.ok ? cutoffs.value : undefined)}
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
        onDelete={deleteInstalment}
      />
    </ViewLayout>
  );
}
