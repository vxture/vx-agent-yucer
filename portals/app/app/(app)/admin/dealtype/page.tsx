import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { listDealTypes, dealTypeUsage } from "../../../domains/pipeline/service";
import { DealTypeConfig } from "../../components/deal-type-config";
import {
  moveDealTypeAction,
  removeDealTypeAction,
  saveDealType,
} from "../../pipeline/deal-type-actions";
import { loadFailureText } from "../../lib/load-failure";

// 商机类型 - 业务参数, one item in 配置管理 (incr/0060-0061).
//
// TEMPORARY ROUTE, the same shape /admin/stage is: this page's content moves
// into /admin/opportunity's 商机类型 section in the last PR of this batch.

export const dynamic = "force-dynamic";

export default async function DealTypePage() {
  const { ADMIN_TEXT, LOAD_ERROR, SHELL_TEXT, DEAL_TYPE_TEXT } = await getMessages();
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
    store: session.stores.pipeline(),
  };
  if (!can(session.authz, session.entitlement, "pipeline.dealtype.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }
  const editable = can(session.authz, session.entitlement, "pipeline.dealtype.manage", "ui").allowed;

  const [dealTypes, usage] = await Promise.all([
    listDealTypes(ctx),
    dealTypeUsage(ctx),
  ]);
  if (!dealTypes.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(dealTypes.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DEAL_TYPE_TEXT.title}
      />
      <DealTypeConfig
        dealTypes={dealTypes.value}
        usage={usage.ok ? usage.value : {}}
        editable={editable}
        onSave={saveDealType}
        onMove={moveDealTypeAction}
        onDelete={removeDealTypeAction}
      />
    </ViewLayout>
  );
}
