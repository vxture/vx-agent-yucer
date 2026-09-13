import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { PageCrumbs } from "../../../components/page-crumbs";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getAuthzStore } from "../../../../authz/store";
import { listPresetRoles, listRoleGroups } from "../../../../authz/roles";
import { RoleForm } from "../../../components/role-form";
import { permissionOptions } from "../../../lib/role-options";

// 新建角色 - the create half of the module's list/create split.

export const dynamic = "force-dynamic";

export default async function NewRolePage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, PERMISSION_LABEL, PERMISSION_TREE_TEXT, ROLE_TEXT, SHELL_TEXT } = await getMessages();
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
  const [presets, lines, ranks] = await Promise.all([
    listPresetRoles(ctx), listRoleGroups(ctx, "line"), listRoleGroups(ctx, "rank"),
  ]);

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.roles, href: "/admin/roles" },
        ]}
        current={ROLE_TEXT.newRole}
      />
      <ViewHeader icon="medal" title={ROLE_TEXT.newRole} description={ROLE_TEXT.formWhy} />
      <RoleForm
        isNew
        code=""
        name=""
        description=""
        lineId={null}
        rankId={null}
        lines={lines.ok ? lines.value : []}
        ranks={ranks.ok ? ranks.value : []}
        permissions={[]}
        members={0}
        /* The module's word: the sidebar's, and for the admin plane the
           tree's own (成员与权限) - DOMAIN_LABEL has no `admin`. */
        options={permissionOptions(PERMISSION_LABEL, { ...DOMAIN_LABEL, ...PERMISSION_TREE_TEXT.moduleLabel })}
        presets={presets.ok ? presets.value : []}
      />
    </ViewLayout>
  );
}
