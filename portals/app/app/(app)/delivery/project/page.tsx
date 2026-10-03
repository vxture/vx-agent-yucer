import { ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getCatalogStore, getDeliveryStore } from "../../../domains/shared/registry";
import { listProjects } from "../../../domains/delivery/service";
import { listAccounts } from "../../../domains/account/service";
import { listPipeline } from "../../../domains/pipeline/service";
import { pricingPolicy } from "../../../domains/catalog/service";
import { ProjectForm } from "../../components/project-form";
import { createProjectAction, saveProject } from "./actions";

// 新建 / 修改项目 - the project's own form. A project could not be created in
// the product, only read. ?id=X edits that project (number, customer and deal
// lock); a delivered, closed or cancelled one is a record and is not offered for
// edit. ?account=X presets the customer. One gate for both: delivery.project.upsert.

export const dynamic = "force-dynamic";

const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function ProjectFormPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ id?: string; account?: string }>;
}) {
  const { DOMAIN_LABEL, DELIVERY_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  if (!can(session.authz, session.entitlement, "delivery.project.upsert", "ui").allowed) redirect("/delivery");

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const [projects, accounts, deals, policy] = await Promise.all([
    listProjects({ ...base, store: getDeliveryStore() }, {}),
    listAccounts({ ...base, store: session.stores.account() }),
    listPipeline({ ...base, store: session.stores.pipeline() }, {}),
    pricingPolicy({ ...base, store: getCatalogStore() }),
  ]);
  const rows = projects.ok ? projects.value : [];
  const accountRows = accounts.ok ? accounts.value : [];
  const { id, account } = await searchParams;
  const found = id ? rows.find((p) => p.id === id) : undefined;
  const editable = found && !["delivered", "closed", "cancelled"].includes(found.status) ? found : undefined;

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: DOMAIN_LABEL.delivery, href: "/delivery" }]}
        current={editable ? DELIVERY_TEXT.editProjectTitle : DELIVERY_TEXT.newProjectTitle}
      />
      <ViewHeader
        title={editable ? DELIVERY_TEXT.editProjectTitle : DELIVERY_TEXT.newProjectTitle}
        description={editable ? DELIVERY_TEXT.editProjectWhy : DELIVERY_TEXT.newProjectWhy}
      />
      <ProjectForm
        key={editable ? editable.id : "new"}
        existingNos={rows.map((p) => p.projectNo)}
        accounts={accountRows.map((a) => ({ id: a.id, name: a.name }))}
        deals={(deals.ok ? deals.value : []).map((d) => ({ id: d.id, name: d.name, accountId: d.accountId }))}
        defaultCurrency={policy.ok ? policy.value.defaultCurrency : "CNY"}
        presetAccountId={account && accountRows.some((a) => a.id === account) ? account : undefined}
        initial={
          editable
            ? {
                id: editable.id,
                projectNo: editable.projectNo,
                name: editable.name,
                accountName: accountRows.find((a) => a.id === editable.accountId)?.name ?? "",
                managerSub: editable.managerSub,
                contractAmount: editable.contractAmount?.amount ?? null,
                currency: editable.currency,
                endsAt: dayOf(editable.endsAt),
                engagementType: editable.engagementType,
              }
            : undefined
        }
        onCreate={createProjectAction}
        onSave={saveProject}
      />
    </ViewLayout>
  );
}
