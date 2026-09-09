import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { PageCrumbs } from "../../../components/page-crumbs";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getAuthzStore } from "../../../../authz/store";
import { listPresetRoles, listRoles } from "../../../../authz/roles";
import { RoleForm } from "../../../components/role-form";
import { permissionOptions } from "../../../lib/role-options";

// 配置角色 - the same form, opened on an existing one. ROUTED BY ID, like the
// division form: the code is the anchor, the id is the row's.

export const dynamic = "force-dynamic";

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const [roles, presets] = await Promise.all([listRoles(ctx), listPresetRoles(ctx)]);
  const mine = roles.ok ? roles.value.find((r) => r.id === id) : undefined;
  // An id nobody has is not an error page - the list is one click away.
  if (!mine) redirect("/admin/roles");

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.roles, href: "/admin/roles" },
        ]}
        current={mine.name}
      />
      <ViewHeader title={mine.name} description={ROLE_TEXT.formWhy} />
      <RoleForm
        isNew={false}
        code={mine.code}
        name={mine.name}
        description={mine.description}
        permissions={mine.permissions}
        members={mine.members}
        /* The module's word: the sidebar's, and for the admin plane the
           tree's own (成员与权限) - DOMAIN_LABEL has no `admin`. */
        options={permissionOptions(PERMISSION_LABEL, { ...DOMAIN_LABEL, ...PERMISSION_TREE_TEXT.moduleLabel })}
        presets={presets.ok ? presets.value : []}
      />
    </ViewLayout>
  );
}
