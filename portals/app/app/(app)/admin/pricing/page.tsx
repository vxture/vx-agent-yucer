import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { pricingPolicy } from "../../../domains/catalog/service";
import { getCatalogStore } from "../../../domains/shared/registry";
import { PricingPolicyConfig } from "../../components/pricing-policy-config";
import { savePricingPolicy } from "../../catalog/pricing-actions";
import { loadFailureText } from "../../lib/load-failure";

// 计价规则 - 业务参数, one item in 配置管理 (incr/0044).
//
// WHY IT LIVES HERE AND NOT ON /pricebook. The currency is configuration -
// set once, assumed by every line, quote and roll-up afterwards - and the
// price book is where a person works through the prices themselves.

export const dynamic = "force-dynamic";

export default async function PricingPolicyPage() {
  const { ADMIN_TEXT, LOAD_ERROR, PRICING_TEXT, SHELL_TEXT } = await getMessages();
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
    store: getCatalogStore(),
  };
  if (!can(session.authz, session.entitlement, "catalog.pricebook.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }
  const policy = await pricingPolicy(ctx);
  if (!policy.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(policy.violations, LOAD_ERROR)}
      />
    );
  }
  return (
    <ViewLayout>
      <PageCrumbs trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]} current={PRICING_TEXT.title} />
      <PricingPolicyConfig
        policy={policy.value}
        canWrite={can(session.authz, session.entitlement, "catalog.pricebook.upsert", "ui").allowed}
        onSave={savePricingPolicy}
      />
    </ViewLayout>
  );
}
