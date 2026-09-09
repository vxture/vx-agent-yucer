import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { ROLE_CODES, ROLE_PERMISSIONS } from "../../../authz/catalog";
import { ACTIONS } from "../../../authz/actions";
import { buildPermissionTree } from "../../lib/permission-tree";
import { PermissionTree } from "../../components/permission-tree";
import { Tag } from "../../components/tag";

// 权限管理 - the catalogue as a tree: 业务域 / 模块 / 页面 / 操作, with one
// column per role (owner, 2026-09-09).
//
// READ FROM THE MIRRORS, NOT RESTATED. The tree is built off authz/actions.ts
// and the grants off authz/catalog.ts; both are mirrors of seeded DDL and the
// mirror tests fail on any drift. The numbers in the header are counted here
// for the same reason the old page counted them: a page that printed its own
// copy would be one more place to be wrong.

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
          <Tag>{PERMISSION_TREE_TEXT.count(Object.keys(ACTIONS).length, ROLE_CODES.length)}</Tag>
        }
      />
      <PermissionTree tree={tree} roles={ROLE_CODES} holds={ROLE_PERMISSIONS} />
    </ViewLayout>
  );
}
