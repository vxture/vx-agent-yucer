import { EmptyState, StatusBadge, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { PERM_CODES } from "../../../authz/catalog";
import { listPresetRoles, listRoles } from "../../../authz/roles";
import { RolePanel } from "../../components/role-panel";
import { RoleReset } from "../../components/role-reset";
import { NewEntryLink } from "../../components/form-page";

// 角色管理 - the workspace's own roles (incr/0046).
//
// IT USED TO BE READ-ONLY, and honestly so: a role was seeded DDL mirrored in
// TypeScript. The owner's ruling of 2026-09-09 made a role the workspace's
// (支持新建，排序，授权; 有系统预置角色，可以自定义), so this is the list half of
// the same list/create split /admin/division has: the roster states, the row
// leads to the form, 新建 and 重置预置 sit in the header's action slot.
//
// THE ROSTER GIVES A SENTENCE AND A COUNT, not the grants (owner: 不显示所有
// 权限名称). 权限详情 in the row menu opens the tree in a drawer.
//
// GATED ON admin.member.view to read, admin.role.upsert to change - the same
// permission (admin.manage) behind both, because whoever may say who holds a
// role may say what the role is.

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, ROLE_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "admin.member.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  };
  const [roles, presets] = await Promise.all([listRoles(ctx), listPresetRoles(ctx)]);
  if (!roles.ok) {
    return <EmptyState title={SHELL_TEXT.loadFailed} description={ROLE_TEXT.emptyWhy} />;
  }
  const rows = roles.value;
  const editable = can(session.authz, session.entitlement, "admin.role.upsert", "ui").allowed;
  const custom = rows.filter((r) => !r.preset).length;
  // What 重置预置 would change, counted here so the dialog can say it.
  const presetList = presets.ok ? presets.value : [];
  const changed = rows.filter((r) => presetList.some((p) => p.code === r.code) && !r.preset).length;
  const missing = presetList.filter((p) => !rows.some((r) => r.code === p.code)).length;

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.roles}
      />
      <ViewHeader
        icon="role"
        title={ROLE_TEXT.title}
        description={ROLE_TEXT.why}
        secondary={
          <StatusBadge tone={rows.some((r) => r.permissions.length === 0) ? "warning" : "success"}>
            {ROLE_TEXT.coverage(rows.length, custom, PERM_CODES.length)}
          </StatusBadge>
        }
        action={
          editable ? (
            <>
              <NewEntryLink href="/admin/roles/new" label={ROLE_TEXT.newRole} />
              {/* The two vocabularies' own page (0047): configuration beside
                  the other ways to change what the roster says. */}
              <NewEntryLink href="/admin/roles/groups" label={ROLE_TEXT.groupsButton} />
              <RoleReset changed={changed} missing={missing} />
            </>
          ) : null
        }
      />
      <RolePanel rows={rows} total={PERM_CODES.length} editable={editable} />
    </ViewLayout>
  );
}
