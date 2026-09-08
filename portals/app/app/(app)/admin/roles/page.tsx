import { EmptyState, StatusBadge, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listWorkspaceMembers } from "../../../authz/admin";
import { ROLE_CODES, ROLE_PERMISSIONS } from "../../../authz/catalog";
import { RoleTable } from "../../components/role-table";

// 角色管理 - what each of the nine roles actually is.
//
// THE QUESTION THAT HAD NO SURFACE. A member page can assign 销售经理 to
// somebody; nothing in the product could answer what 销售经理 may then do. The
// answer existed in three places - the seed (incr/0021), authz/catalog.ts and
// the catalogue doc - and in none of them was it readable by the person doing
// the assigning.
//
// READ-ONLY, and that is the honest shape rather than a missing feature: a
// role's grants are seeded DDL mirrored in TypeScript, and changing one means
// changing the seed, the mirror and 50-role-permission-catalog.md together,
// with mirror tests failing in both directions if they drift. A checkbox here
// would be a control that cannot keep its promise.
//
// GATED ON admin.member.view. Who may see the role catalogue is the same
// question as who may see the members holding those roles.

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const { ADMIN_PAGE_TEXT, ADMIN_TEXT, ROLE_LABEL, SHELL_TEXT } = await getMessages();
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

  /* HOW MANY PEOPLE HOLD IT, beside what it can do. A role nobody holds is a
     different fact from a role that is wrong, and an admin deciding whether to
     narrow one needs to know who they would be narrowing. A refused read is
     not fatal: the catalogue half of this page still answers its question. */
  const members = await listWorkspaceMembers({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  });
  const held = new Map<string, number>();
  if (members.ok) {
    for (const m of members.value) {
      for (const r of m.roles) held.set(r, (held.get(r) ?? 0) + 1);
    }
  }

  const rows = ROLE_CODES.map((code) => ({
    code,
    name: ROLE_LABEL[code] ?? code,
    permissions: [...ROLE_PERMISSIONS[code]],
    members: held.get(code) ?? 0,
  }));
  const grants = rows.reduce((n, r) => n + r.permissions.length, 0);

  return (
    <ViewLayout>
      <ViewHeader
        icon="role"
        title={ADMIN_PAGE_TEXT.rolesTitle}
        description={ADMIN_PAGE_TEXT.rolesWhy}
        secondary={
          <StatusBadge tone="neutral">
            {ADMIN_PAGE_TEXT.permissionsCount(
              new Set(rows.flatMap((r) => r.permissions)).size,
              rows.length,
              grants,
            )}
          </StatusBadge>
        }
      />
      <RoleTable rows={rows} />
    </ViewLayout>
  );
}
