import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { ageingCutoffs } from "../../../domains/delivery/service";
import { getDeliveryStore } from "../../../domains/shared/registry";
import { AgeingPolicyConfig } from "../../components/ageing-policy-config";
import { saveAgeingCutoffs } from "../../delivery/ageing-actions";
import { loadFailureText } from "../../lib/load-failure";

// 账龄分档 - 业务参数, one item in 配置管理 (incr/0042).
//
// WHY IT LIVES HERE AND NOT ON /collection. The cutoffs are configuration -
// set once, read by every ageing chart afterwards - and 回款管理 is where a
// person chases the money itself.

export const dynamic = "force-dynamic";

export default async function AgeingPolicyPage() {
  const { ADMIN_TEXT, AGEING_TEXT, LOAD_ERROR, SHELL_TEXT } = await getMessages();
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
  if (!can(session.authz, session.entitlement, "delivery.revenue.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const cutoffs = await ageingCutoffs(ctx);
  if (!cutoffs.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(cutoffs.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={AGEING_TEXT.title}
      />
      <AgeingPolicyConfig
        cutoffs={cutoffs.value}
        canWrite={can(session.authz, session.entitlement, "delivery.revenue.upsert", "ui").allowed}
        onSave={saveAgeingCutoffs}
      />
    </ViewLayout>
  );
}
