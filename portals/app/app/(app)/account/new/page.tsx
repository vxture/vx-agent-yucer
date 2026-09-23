import { ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import {
  listCustomerNatures,
  listCustomerSizes,
  listCustomerTypes,
  listIndustries,
} from "../../../domains/account/service";
import { listSegments } from "../../../domains/strategy/service";
import { getStrategyStore } from "../../../domains/shared/registry";
import { AccountCreateForm } from "../../components/account-create-form";
import { createAccountAction } from "../actions";

// 新建客户 (owner, 2026-09-23: 独立页面全字段表单). Before this page the product
// had no way to create a customer at all. Gated like every create page here:
// a member who may not write is sent back to the list rather than shown a
// form that would refuse them on save.

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const { ACCOUNT_BASICS_TEXT, DOMAIN_LABEL } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx renders the SignIn screen without a session.
  if (!can(session.authz, session.entitlement, "account.upsert", "ui").allowed) redirect("/account");

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };
  const [industries, types, sizes, natures, segments] = await Promise.all([
    listIndustries(ctx),
    listCustomerTypes(ctx),
    listCustomerSizes(ctx),
    listCustomerNatures(ctx),
    listSegments({ ...ctx, store: getStrategyStore() }),
  ]);
  const opts = <T extends { id: string; name: string }>(r: { ok: boolean; value?: readonly T[] }) =>
    r.ok && r.value ? r.value.map((x) => ({ id: x.id, name: x.name })) : [];

  return (
    <ViewLayout>
      <PageCrumbs trail={[{ label: DOMAIN_LABEL.account, href: "/account" }]} current={ACCOUNT_BASICS_TEXT.createCrumb} />
      <ViewHeader title={ACCOUNT_BASICS_TEXT.createTitle} description={ACCOUNT_BASICS_TEXT.createWhy} />
      <AccountCreateForm
        vocab={{
          industries: opts(industries),
          customerTypes: opts(types),
          customerSizes: opts(sizes),
          customerNatures: opts(natures),
          segments: segments.ok ? segments.value.map((g) => ({ id: g.segmentCode, name: g.name })) : [],
        }}
        onCreate={createAccountAction}
      />
    </ViewLayout>
  );
}
