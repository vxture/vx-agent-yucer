import { EmptyState, Section } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { DELIVERY_TEXT, SHELL_TEXT } from "../lib/messages";
import { getDeliveryStore } from "../../domains/shared/registry";
import { listProjects, projectView } from "../../domains/delivery/service";
import { DeliveryTable, type DeliveryRow } from "../components/delivery-table";

export const dynamic = "force-dynamic";

// D7 delivery list.
//
// The health column shows the DERIVED value, and marks the row when it differs
// from what the delivery team reported. A list that showed the reported colour
// would hide exactly the projects worth looking at: the overdue-forbids-green
// rule exists because "we are fine" next to "they have not paid" is how a
// failing engagement stays green until it is a crisis.

export default async function DeliveryPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
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
        description={projects.violations.map((v) => v.message).join("; ")}
      />
    );
  }

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
      overriddenBecause: view.ok ? view.value.healthOverriddenBecause : null,
    });
  }

  return (
    <Section title={DELIVERY_TEXT.title} description={DELIVERY_TEXT.description}>
      <DeliveryTable rows={rows} />
    </Section>
  );
}
