import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { PageCrumbs } from "../../../components/page-crumbs";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getAuthzStore } from "../../../../authz/store";
import { listRoleGroups } from "../../../../authz/roles";
import { RoleGroupsConfig } from "../../../components/role-groups-config";
import { Tag } from "../../../components/tag";

// 角色分组 - the two vocabularies a role is placed by (incr/0047), stacked
// the way 产品配置 stacks its three. Reached from the roster's header; not a
// sidebar item, because it is one step inside 角色管理 rather than a module.

export const dynamic = "force-dynamic";

export default async function RoleGroupsPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, ROLE_GROUP_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "admin.role.upsert", "ui").allowed) {
    redirect("/admin/roles");
  }
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  };
  const [lines, ranks] = await Promise.all([listRoleGroups(ctx, "line"), listRoleGroups(ctx, "rank")]);
  const lineRows = lines.ok ? lines.value : [];
  const rankRows = ranks.ok ? ranks.value : [];

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.roles, href: "/admin/roles" },
        ]}
        current={ROLE_GROUP_TEXT.pageTitle}
      />
      <ViewHeader
        icon="role"
        title={ROLE_GROUP_TEXT.pageTitle}
        description={ROLE_GROUP_TEXT.pageWhy}
        secondary={<Tag>{ROLE_GROUP_TEXT.count(lineRows.length, rankRows.length)}</Tag>}
      />
      <RoleGroupsConfig kind="line" rows={lineRows} />
      <RoleGroupsConfig kind="rank" rows={rankRows} />
    </ViewLayout>
  );
}
