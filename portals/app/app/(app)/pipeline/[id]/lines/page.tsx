import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getCatalogStore } from "../../../../domains/shared/registry";
import { getOpportunityDetail } from "../../../../domains/pipeline/service";
import {
  listOpportunityLines,
  listProducts as listCatalogProducts,
} from "../../../../domains/catalog/service";
import { LineEditor } from "../../../components/line-editor";
import { approveDiscount, saveOpportunityLines } from "../../stage-action";

// 行项编辑 - a page since 2026-09-05 (owner ruling: the 418-line editor is the
// heaviest content operation left inline, and a page gives it the room the
// deal page could not). The deal page keeps the READ view of the same rows -
// display stays where the context is; editing happens here and returns.

export const dynamic = "force-dynamic";

export default async function DealLinesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { SHELL_TEXT, OPPORTUNITY_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
  const detail = await getOpportunityDetail(ctx, id);
  if (!detail.ok) redirect("/pipeline");
  const opportunity = detail.value;

  const canEdit = can(session.authz, session.entitlement, "pipeline.opportunity.update", "ui").allowed;
  if (!canEdit) redirect(`/pipeline/${id}`);

  const catalogCtx = { ...ctx, store: getCatalogStore() };
  const [lineRows, productRows] = await Promise.all([
    listOpportunityLines(catalogCtx),
    listCatalogProducts(catalogCtx),
  ]);

  return (
    <ViewLayout>
      <ViewHeader
        title={OPPORTUNITY_TEXT.linesPageTitle(opportunity.name)}
        description={OPPORTUNITY_TEXT.linesWhy}
      />
      <LineEditor
        opportunityId={id}
        lines={(lineRows.ok ? lineRows.value : [])
          .filter((l) => l.opportunityId === id)
          .map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
            needsApproval: l.needsApproval,
            approved: l.approved,
          }))}
        products={(productRows.ok ? productRows.value : [])
          .filter((p) => p.status === "active")
          .map((p) => ({ id: p.id, name: p.name, unit: p.unit }))}
        canEdit
        canApprove={can(session.authz, session.entitlement, "pipeline.discount.approve", "ui").allowed}
        closed={opportunity.closedAt !== null}
        onSave={saveOpportunityLines}
        onApprove={approveDiscount}
        doneHref={`/pipeline/${id}`}
      />
    </ViewLayout>
  );
}
