import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { industryUsage, listIndustries } from "../../../domains/account/service";
import { IndustryConfig } from "../../components/industry-config";
import {
  moveIndustryAction,
  removeIndustryAction,
  saveIndustry,
} from "../../account/industry-actions";
import { loadFailureText } from "../../lib/load-failure";

// 行业分类 - 业务参数, one item in 配置管理 (incr/0040).
//
// WHY IT LIVES HERE. The list is configuration - set once, read by every
// customer record and every segment afterwards - and 客户管理 is where a person
// works through the customers themselves.
//
// THE FILED COUNT IS COMPUTED HERE, from the customers the workspace already
// has: it is what makes the delete refusal predictable rather than a surprise
// at the moment of clicking.

export const dynamic = "force-dynamic";

export default async function IndustryPage() {
  const { ADMIN_TEXT, INDUSTRY_TEXT, LOAD_ERROR, SHELL_TEXT } = await getMessages();
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
    store: session.stores.account(),
  };
  if (!can(session.authz, session.entitlement, "account.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const [industries, usage] = await Promise.all([listIndustries(ctx), industryUsage(ctx)]);
  if (!industries.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(industries.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={INDUSTRY_TEXT.configTitle}
      />
      {/* The header is the PANEL's, not the page's: 新建行业 opens a dialog the
          panel owns, and the DS puts a page's actions in the ViewHeader's own
          slot (the call /admin/division already made). A page that rendered
          the header here would have to keep the button somewhere else. */}
      <IndustryConfig
        industries={industries.value}
        usage={usage.ok ? usage.value : {}}
        onSave={saveIndustry}
        onMove={moveIndustryAction}
        onDelete={removeIndustryAction}
      />
    </ViewLayout>
  );
}
