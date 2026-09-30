import { EmptyState, StatusBadge, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { Tag } from "../../components/tag";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listRoles } from "../../../authz/roles";
import { ACTIONS } from "../../../authz/actions";
import { buildPermissionTree, unheldActionCount } from "../../lib/permission-tree";
import { PermissionTree } from "../../components/permission-tree";

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
  const { ADMIN_TEXT, DOMAIN_LABEL, PERMISSION_TREE_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.
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
  // 未持有角色的权限点 (owner, 2026-09-10: 参考平台治理平面"未绑定"的提示,
  // 换成我们真实有的信号 - nothing here is ever disabled or unbound from its
  // OWN definition, but who may act on it can still be nobody).
  const unheld = unheldActionCount(tree, new Set(rows.flatMap((r) => r.permissions)));
  const totalActions = Object.keys(ACTIONS).length;

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.permissions}
      />
      {/* 三个数放在标题旁，按标签显示 (owner, 2026-09-30: 三张统计卡提到页面
          标题后，参考角色管理的 title + tags). They were three MetricCards
          under the header (2026-09-10 / 09-11); the numbers are the same, and
          the third still turns to a warning when an operation nobody holds
          exists - a real audit signal, not a filler. */}
      <ViewHeader
        icon="key"
        title={PERMISSION_TREE_TEXT.title}
        description={PERMISSION_TREE_TEXT.why}
        secondary={
          <span className="gap-xs flex flex-wrap items-center">
            <Tag>{PERMISSION_TREE_TEXT.tagOperations(totalActions)}</Tag>
            <Tag>{PERMISSION_TREE_TEXT.tagRoles(rows.length)}</Tag>
            {unheld > 0 ? (
              <StatusBadge tone="warning">{PERMISSION_TREE_TEXT.tagUnheld(unheld)}</StatusBadge>
            ) : (
              <StatusBadge tone="success">{PERMISSION_TREE_TEXT.tagAllHeld}</StatusBadge>
            )}
          </span>
        }
      />
      <PermissionTree tree={tree} roles={columns} holds={holds} />
    </ViewLayout>
  );
}
