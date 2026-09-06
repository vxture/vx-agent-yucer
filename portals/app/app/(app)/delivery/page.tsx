import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { formatMoney } from "../lib/view-model";
import {
  getAccountStore,
  getDeliveryStore,
} from "../../domains/shared/registry";
import { listProjects, projectView } from "../../domains/delivery/service";
import { listAccounts } from "../../domains/account/service";
import { DeliveryRoster, type DeliveryRow } from "../components/delivery-roster";
import { DeliveryAnalysis } from "../components/delivery-analysis";
import { ModuleHeadline, type HeadlineStat } from "../components/module-headline";
import { deliveryStats, PROJECT_STAGES } from "../../domains/delivery/lib/delivery-stats";
import { NewEntryLink } from "../components/form-page";
import { reconcileHealth } from "./actions";
import { can } from "../../authz/decide";

import { getMessages } from "../lib/i18n/server";
import { loadFailureText } from "../lib/load-failure";
export const dynamic = "force-dynamic";

// D7 delivery list.
//
// The health column shows the DERIVED value, and marks the row when it differs
// from what the delivery team reported. A list that showed the reported colour
// would hide exactly the projects worth looking at: the overdue-forbids-green
// rule exists because "we are fine" next to "they have not paid" is how a
// failing engagement stays green until it is a crisis.

export default async function DeliveryPage() {
  const { DELIVERY_TEXT, PROJECT_STATUS_LABEL, SHELL_TEXT, LOAD_ERROR } = await getMessages();
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

  const projects = await listProjects(ctx, { limit: 100 });
  if (!projects.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(projects.violations, LOAD_ERROR)}
      />
    );
  }

  // Customer names, so the account column is a name and not an id fragment.
  //
  // Read through the SAME gated service the account page uses, which means a
  // member who may see delivery but not accounts simply gets no names - the
  // column falls back to the id rather than the page refusing. Borrowing a
  // store directly to dodge that gate would be reading another domain's rows
  // around its own rules.
  const accounts = await listAccounts({
    ...ctx,
    store: session.stores.account(),
  });
  const accountNames = new Map(
    accounts.ok ? accounts.value.map((a) => [a.id, a.name]) : [],
  );

  // Each row's health is reconciled against its instalments and milestones.
  // Done per project because the rule needs both, and a list query cannot carry
  // them; the page is capped at 100 rows for the same reason.
  const rows: DeliveryRow[] = [];
  for (const p of projects.value) {
    const view = await projectView(ctx, p.id);
    rows.push({
      id: p.id,
      name: p.name,
      projectNo: p.projectNo,
      accountId: p.accountId,
      managerSub: p.managerSub,
      contractAmount: p.contractAmount?.amount ?? null,
      currency: p.currency,
      status: p.status,
      reported: p.health,
      derived: view.ok ? view.value.derivedHealth : p.health,
      accountName: accountNames.get(p.accountId) ?? null,
      // THE PLAN TRAVELS WITH ITS PROJECT. It came off the same projectView
      // this loop already makes, and the row is where it belongs - the flat
      // cross-project table it replaced spent a column repeating the parent.
      milestones: view.ok
        ? view.value.milestones.map((m) => ({
            id: m.id,
            sequence: m.sequence,
            name: m.name,
            status: m.status,
            dueAt: m.dueAt ? m.dueAt.toISOString().slice(0, 10) : null,
            completedAt: m.completedAt ? m.completedAt.toISOString().slice(0, 10) : null,
          }))
        : [],
    });
  }

  const stats = deliveryStats(rows);
  const currency = rows.find((r) => r.contractAmount != null)?.currency ?? "CNY";
  const running = rows.filter(
    (r) => r.status !== "delivered" && r.status !== "closed" && r.status !== "cancelled",
  );
  const red = stats.byHealth.find((b) => b.key === "red")?.count ?? 0;
  // THE BREAKDOWN IS THE LIFECYCLE, the same cut collections takes along its
  // own process: where is the work, not who owns it - the list below answers
  // that row by row.
  const stats$: HeadlineStat[] = PROJECT_STAGES.flatMap((stage) => {
    const cell = stats.byStage.find((b) => b.key === stage);
    return cell
      ? [
          {
            key: stage as string,
            name: PROJECT_STATUS_LABEL[stage] ?? stage,
            value: cell.amount,
            note: DELIVERY_TEXT.deliveryStatCount(cell.count),
          },
        ]
      : [];
  });

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey="delivery"
        description={DELIVERY_TEXT.description}
        tags={
          <>
            <StatusBadge tone="success">
              {DELIVERY_TEXT.tagDeliveryRunning(running.length)}
            </StatusBadge>
            {stats.downgraded > 0 ? (
              <StatusBadge tone="warning">
                {DELIVERY_TEXT.tagDeliveryDowngraded(stats.downgraded)}
              </StatusBadge>
            ) : null}
            {red > 0 ? (
              <StatusBadge tone="danger">{DELIVERY_TEXT.tagDeliveryRed(red)}</StatusBadge>
            ) : null}
          </>
        }
        stats={stats$}
        emptyNote={DELIVERY_TEXT.deliveryStatEmpty}
      />

      {/* 统计为主，列表为具体清单 (owner, 2026-09-06) - and both are computed
          from the SAME rows, so the block and the list cannot disagree. */}
      <DeliveryAnalysis stats={stats} liveCount={running.length} currency={currency} />

      <DeliveryRoster
        rows={rows}
        canWrite={
          can(session.authz, session.entitlement, "delivery.project.upsert", "ui").allowed
        }
        onReconcile={reconcileHealth}
      />

      {/* Creation left for /delivery/new on 2026-09-05. */}
      {can(
        session.authz,
        session.entitlement,
        "delivery.milestone.upsert",
        "ui",
      ).allowed ? (
        <NewEntryLink href="/delivery/new" />
      ) : null}
    </ViewLayout>
  );
}
