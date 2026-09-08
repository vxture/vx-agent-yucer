import { EmptyState, StatusBadge, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { PERM_CODES, ROLE_CODES, ROLE_PERMISSIONS } from "../../../authz/catalog";
import { PermissionTable } from "../../components/permission-table";

// 权限管理 - the catalogue, read from the mirror rather than restated.
//
// TWENTY-FIVE, NINE, ONE HUNDRED AND SEVENTEEN. The numbers are computed here
// rather than typed into the copy: they are quoted in CLAUDE.md and in
// 50-role-permission-catalog.md, and a page that printed its own copy of them
// would be a fourth place to be wrong.

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const { ADMIN_PAGE_TEXT, ADMIN_TEXT, PERMISSION_LABEL, ROLE_LABEL, SHELL_TEXT } = await getMessages();
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

  const rows = PERM_CODES.map((code) => ({
    code,
    name: PERMISSION_LABEL[code] ?? code,
    roles: ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes(code)).map(
      (r) => ROLE_LABEL[r] ?? r,
    ),
  }));
  const grants = rows.reduce((n, r) => n + r.roles.length, 0);

  return (
    <ViewLayout>
      <ViewHeader
        icon="key"
        title={ADMIN_PAGE_TEXT.permissionsTitle}
        description={ADMIN_PAGE_TEXT.permissionsWhy}
        secondary={
          <StatusBadge tone="neutral">
            {ADMIN_PAGE_TEXT.permissionsCount(rows.length, ROLE_CODES.length, grants)}
          </StatusBadge>
        }
      />
      <PermissionTable rows={rows} />
    </ViewLayout>
  );
}
