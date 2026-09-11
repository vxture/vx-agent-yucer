import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listRoles } from "../../../authz/roles";
import { ACTIONS } from "../../../authz/actions";
import { buildPermissionTree } from "../../lib/permission-tree";
import { PermissionTree } from "../../components/permission-tree";
import { Tag } from "../../components/tag";

// 权限策略 (renamed from 权限管理, 2026-09-10 - the page never creates or
// edits a permission, so "管理" overpromised) - the catalogue as a tree:
// 业务域 / 模块 / 页面 / 操作, with one column per role (owner, 2026-09-09).
//
// THE TREE IS READ OFF authz/actions.ts, never restated. THE COLUMNS ARE THE
// WORKSPACE'S ROLES (incr/0046) - the presets and whatever the tenant added,
// in the tenant's order - and the ticks are the grants those rows hold; the
// grants are edited on /admin/roles, one role at a time, and read here.

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, PERMISSION_TREE_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }
  if (!can(session.authz, session.entitlement, "admin.member.view", "ui").allowed) {
    return (
      <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />
    );
  }

  const tree = buildPermissionTree();
  const roles = await listRoles({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  });
  const rows = roles.ok ? roles.value : [];
  // In roster order: the first three named on a row are the highest rungs
  // that hold the permission. The line and rung ride along for the panel.
  const columns = rows.map((r) => ({
    code: r.code,
    name: r.name,
    group: r.line && r.rank ? `${r.line.name} · ${r.rank.name}` : (r.line?.name ?? r.rank?.name ?? null),
  }));
  const holds = Object.fromEntries(rows.map((r) => [r.code, r.permissions]));

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.permissions}
      />
      <ViewHeader
        icon="key"
        title={PERMISSION_TREE_TEXT.title}
        description={PERMISSION_TREE_TEXT.why}
        secondary={
          <Tag>{PERMISSION_TREE_TEXT.count(Object.keys(ACTIONS).length, rows.length)}</Tag>
        }
      />
      <PermissionTree tree={tree} roles={columns} holds={holds} />
    </ViewLayout>
  );
}
