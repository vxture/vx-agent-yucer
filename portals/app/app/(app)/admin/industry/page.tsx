import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import {
  customerNatureUsage,
  customerSizeUsage,
  customerTypeUsage,
  industryUsage,
  listCustomerNatures,
  listCustomerSizes,
  listCustomerTypes,
  listIndustries,
} from "../../../domains/account/service";
import { IndustryConfig } from "../../components/industry-config";
import { CustomerTypeConfig } from "../../components/customer-type-config";
import { CustomerSizeConfig } from "../../components/customer-size-config";
import { CustomerNatureConfig } from "../../components/customer-nature-config";
import {
  moveIndustryAction,
  removeIndustryAction,
  saveIndustry,
} from "../../account/industry-actions";
import {
  moveCustomerTypeAction,
  removeCustomerTypeAction,
  saveCustomerType,
} from "../../account/customer-type-actions";
import {
  moveCustomerSizeAction,
  removeCustomerSizeAction,
  saveCustomerSize,
} from "../../account/customer-size-actions";
import {
  moveCustomerNatureAction,
  removeCustomerNatureAction,
  saveCustomerNature,
} from "../../account/customer-nature-actions";
import { loadFailureText } from "../../lib/load-failure";

// 客户分类 - 业务参数, one item in 配置管理 (incr/0040, grown to four
// vocabularies by incr/0071-0072; renamed from 行业分类, owner 2026-09-16).
//
// ONE ITEM, FOUR SECTIONS - the same composition 产品配置 uses for its own
// trio (owner ruling of 2026-09-05 that this page inherits): 行业/客户类型/
// 客户规模/客户性质 are one vocabulary group - four independent ways of
// answering "who is this customer" - set in one sitting. They stay
// INDEPENDENT mechanisms; none of them knows the others exist, so a page that
// composed one editor instead of four panels would be inventing a coupling
// none of the underlying tables have.
//
// WHY IT LIVES HERE. Every one of the three is configuration - set
// occasionally, read by every customer record and every segment afterwards -
// and 客户管理 is where a person works through the customers themselves.
//
// THE FILED COUNTS ARE COMPUTED HERE, from the customers the workspace
// already has: it is what makes each section's delete refusal predictable
// rather than a surprise at the moment of clicking.
//
// GATED ON account.view to read, account.upsert to change - one gate for all
// four, the same authority industry alone used to check: deciding how
// customers are classified is the same authority as deciding what a customer
// is.

export const dynamic = "force-dynamic";

export default async function IndustryPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, LOAD_ERROR, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

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
  /* 能看不能写的中间态是真的 (owner: 所有这些页面、按钮都需要权限点) - view 只
     决定这页可不可见, 新建/改名/删除要 account.upsert. 复用三个服务各自注释里
     点名的同一个权限码, 而不是新造一个。 */
  const editable = can(session.authz, session.entitlement, "account.upsert", "ui").allowed;

  const [
    industries,
    industryFiled,
    customerTypes,
    customerTypeFiled,
    customerSizes,
    customerSizeFiled,
    customerNatures,
    customerNatureFiled,
  ] = await Promise.all([
    listIndustries(ctx),
    industryUsage(ctx),
    listCustomerTypes(ctx),
    customerTypeUsage(ctx),
    listCustomerSizes(ctx),
    customerSizeUsage(ctx),
    listCustomerNatures(ctx),
    customerNatureUsage(ctx),
  ]);
  if (!industries.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(industries.violations, LOAD_ERROR)}
      />
    );
  }
  if (!customerTypes.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(customerTypes.violations, LOAD_ERROR)}
      />
    );
  }
  if (!customerSizes.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(customerSizes.violations, LOAD_ERROR)}
      />
    );
  }
  if (!customerNatures.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(customerNatures.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.industry}
      />
      <ViewHeader
        icon="buildings"
        title={DOMAIN_LABEL.industry}
        description={ADMIN_TEXT.entryHint.industry}
      />
      {/* Each panel's own header is a Section now (icon=, not page=): the
          page header above names the quartet, and each table says which one
          it is - the shape 产品配置's three panels already use. ORDER (owner,
          2026-09-16): 客户性质 / 客户类型 / 客户规模 / 行业分类 - the three
          newer vocabularies first, 行业分类 last since it predates the other
          three and was the page's own name before the rename. Every icon
          here, and the page's own above, is distinct - no two sections (or
          the page) share a glyph. */}
      <CustomerNatureConfig
        customerNatures={customerNatures.value}
        usage={customerNatureFiled.ok ? customerNatureFiled.value : {}}
        editable={editable}
        onSave={saveCustomerNature}
        onMove={moveCustomerNatureAction}
        onDelete={removeCustomerNatureAction}
      />
      <CustomerTypeConfig
        customerTypes={customerTypes.value}
        usage={customerTypeFiled.ok ? customerTypeFiled.value : {}}
        editable={editable}
        onSave={saveCustomerType}
        onMove={moveCustomerTypeAction}
        onDelete={removeCustomerTypeAction}
      />
      <CustomerSizeConfig
        customerSizes={customerSizes.value}
        usage={customerSizeFiled.ok ? customerSizeFiled.value : {}}
        editable={editable}
        onSave={saveCustomerSize}
        onMove={moveCustomerSizeAction}
        onDelete={removeCustomerSizeAction}
      />
      <IndustryConfig
        industries={industries.value}
        usage={industryFiled.ok ? industryFiled.value : {}}
        editable={editable}
        onSave={saveIndustry}
        onMove={moveIndustryAction}
        onDelete={removeIndustryAction}
      />
    </ViewLayout>
  );
}
