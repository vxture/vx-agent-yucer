import { EmptyState, Section, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { formatMoney } from "../lib/view-model";
import {
  getAccountStore,
  getDeliveryStore,
} from "../../domains/shared/registry";
import { listProjects, projectView } from "../../domains/delivery/service";
import { listAccounts } from "../../domains/account/service";
import { DeliveryTable, type DeliveryRow } from "../components/delivery-table";
import {
  MilestonePanel,
  type MilestoneRow,
} from "../components/milestone-panel";
import { reconcileHealth, saveMilestone } from "./actions";
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
  const { DELIVERY_TEXT, SHELL_TEXT, LOAD_ERROR } = await getMessages();
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
  // Gathered in the SAME loop, from the same projectView call the health row
  // comes out of. The instalments left for /collection on 2026-08-30; the
  // milestones stay because a project's plan is what this page is about.
  const milestones: MilestoneRow[] = [];
  for (const p of projects.value) {
    const view = await projectView(ctx, p.id);
    if (view.ok) {
      for (const m of view.value.milestones) {
        milestones.push({
          id: m.id,
          projectId: p.id,
          projectName: p.name,
          sequence: m.sequence,
          name: m.name,
          status: m.status,
          dueAt: m.dueAt ? m.dueAt.toISOString().slice(0, 10) : null,
          completedAt: m.completedAt
            ? m.completedAt.toISOString().slice(0, 10)
            : null,
        });
      }
    }
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
      overriddenBecause: view.ok ? view.value.healthOverriddenBecause : null,
      accountName: accountNames.get(p.accountId) ?? null,
    });
  }

  // Counted here because it is a statement about the page. The downgrade is
  // this domain's whole point: "we are fine" standing next to "they have not
  // paid" is the single most common way a failing engagement stays green until
  // it is a crisis.
  const downgraded = rows.filter((r) => r.overriddenBecause !== null).length;
  const currency =
    rows.find((r) => r.contractAmount != null)?.currency ?? "CNY";
  const contractTotal = rows.reduce((n, r) => n + (r.contractAmount ?? 0), 0);

  return (
    <ViewLayout>
      {/* Opens with what is true of the whole page. The DOWNGRADE RULE rides
          here rather than only in the section subtitle: without it a green row
          reads as the delivery team's own word, which is the one thing it is
          not. */}
      <ViewHeader
        title={DELIVERY_TEXT.lead(rows.length)}
        description={
          <>
            <span className="block tabular-nums">
              {DELIVERY_TEXT.leadContract(formatMoney(contractTotal, currency))}
            </span>
            {downgraded > 0 ? (
              <span className="block text-(color:--warning-text)">
                {DELIVERY_TEXT.leadDowngraded(downgraded)}
              </span>
            ) : null}
            <span className="block">{DELIVERY_TEXT.leadRule}</span>
          </>
        }
      />

      <Section
        icon="package"
        title={DELIVERY_TEXT.title}
        description={DELIVERY_TEXT.description}
      >
        <DeliveryTable
          rows={rows}
          /* Decided here, re-decided inside the action - this only chooses
             whether the menu renders. */
          canWrite={
            can(
              session.authz,
              session.entitlement,
              "delivery.project.upsert",
              "ui",
            ).allowed
          }
          onReconcile={reconcileHealth}
        />
      </Section>

      {/* AFTER the projects, because a project is the thing a person opens this
          page for and its instalments are what that project owes. Putting the
          money first would make the page a ledger; putting it second makes it
          the answer to "and has it been paid". */}
      <MilestonePanel
        rows={milestones}
        projects={
          projects.ok
            ? projects.value.map((p) => ({ id: p.id, name: p.name }))
            : []
        }
        canEdit={
          can(
            session.authz,
            session.entitlement,
            "delivery.milestone.upsert",
            "ui",
          ).allowed
        }
        onSave={saveMilestone}
      />
    </ViewLayout>
  );
}
