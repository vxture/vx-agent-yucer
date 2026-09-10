import { Button, EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listWorkspaceMembers } from "../../../authz/admin";
import { listRoles } from "../../../authz/roles";
import { MemberPanel, type MemberRow } from "../../components/member-panel";
import { listOrgMembers, listOrgUnits, listTerritories } from "../../../domains/planning/service";
import { getPlanningStore } from "../../../domains/shared/registry";
import { consoleMembersUrl } from "../../lib/console-url";
import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
import { Tag } from "../../components/tag";

// 成员管理 - the roster. DISPLAY ONLY (owner, 2026-09-10: 展示信息和编辑、新建
// 混合在一个页面，大bug): this page states who is here; 成员配置 in the row
// menu leads to /admin/members/[id], where roles, unit and scope are set;
// 停用 / 恢复在岗 / 转交客户 are row operations behind their confirmations.
//
// TWO VIEWS (owner, 2026-09-10: 提供清单视图、组织视图): the roster as a
// table, and the same people laid out under the organisation's units -
// names only. The panel switches; this page supplies both the rows and the
// unit tree they are placed in (several units per person since 0053).
//
// Membership is LAZY: a row appears on the first sighting of (workspace, sub)
// at login, with no roles. So this list is "everyone who has ever signed in",
// not "everyone the platform says belongs here". INVITING IS A PLATFORM ACT -
// seats and who may sign in are the platform's - so 邀请成员 is a link out.

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, LOAD_ERROR, MEMBER_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const authz = { ...base, store: getAuthzStore() };
  const planning = { ...base, store: getPlanningStore() };
  const [result, roles, units, placements, territories] = await Promise.all([
    listWorkspaceMembers(authz),
    listRoles(authz),
    listOrgUnits(planning),
    listOrgMembers(planning),
    listTerritories(planning),
  ]);
  if (!result.ok) {
    return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(result.violations, LOAD_ERROR)} />;
  }
  // Names, in the workspace's own words (0046): a tenant who renamed 销售经理
  // sees their word.
  const roleOf = new Map((roles.ok ? roles.value : []).map((r) => [r.code, { code: r.code, name: r.name, admin: r.permissions.includes("admin.manage") }]));
  const unitName = new Map((units.ok ? units.value : []).map((u) => [u.id, u.name]));
  const territoryName = new Map((territories.ok ? territories.value : []).map((t) => [t.id, t.name]));
  const placed = placements.ok ? placements.value : new Map<string, string[]>();
  const rows: MemberRow[] = result.value.map((m) => ({
    memberId: m.memberId,
    sub: m.sub,
    name: m.displayName ?? m.sub,
    roles: m.roles.map((code) => roleOf.get(code) ?? { code, name: code, admin: false }),
    status: m.status,
    // Several since 0053, in tree order; a unit the tree no longer has keeps
    // its id on the row rather than vanishing (the FK CASCADEs, so it is rare).
    units: (placed.get(m.sub) ?? []).map((id) => ({ id, name: unitName.get(id) ?? id })),
    scope: m.scope,
    territories: m.territoryIds.map((id) => territoryName.get(id)).filter((x): x is string => Boolean(x)),
  }));
  // Viewing and changing are separate actions on purpose: the list is useful
  // to anyone who can see it, and only an administrator gets the controls.
  const canManage = can(session.authz, session.entitlement, "admin.member.role.assign", "ui").allowed;
  const inviteUrl = consoleMembersUrl();
  const active = rows.filter((r) => r.status === "active").length;

  return (
    <ViewLayout>
      <PageCrumbs trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]} current={DOMAIN_LABEL.members} />
      <ViewHeader
        icon="users"
        title={DOMAIN_LABEL.members}
        description={MEMBER_TEXT.description}
        secondary={<Tag>{MEMBER_TEXT.count(active, rows.length - active)}</Tag>}
        action={
          canManage && inviteUrl ? (
            <Button asChild variant="secondary">
              <a href={inviteUrl} target="_blank" rel="noreferrer">{MEMBER_TEXT.invite}</a>
            </Button>
          ) : null
        }
      />
      <MemberPanel
        rows={rows}
        canManage={canManage}
        orgUnits={(units.ok ? units.value : []).map((u) => ({ id: u.id, name: u.name, parentId: u.parentId }))}
        roleOptions={[...roleOf.values()]}
      />
    </ViewLayout>
  );
}
