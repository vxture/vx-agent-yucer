import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { PageCrumbs } from "../../../components/page-crumbs";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getAuthzStore } from "../../../../authz/store";
import { listWorkspaceMembers } from "../../../../authz/admin";
import { listRoles } from "../../../../authz/roles";
import { DATA_SCOPES } from "../../../../authz/scope";
import { getPlanningStore } from "../../../../domains/shared/registry";
import { listOrgMembers, listOrgUnits, listTerritories } from "../../../../domains/planning/service";
import { MemberForm } from "../../../components/member-form";

// 配置成员 - the one form. ROUTED BY THE ROW'S ID; the sub is the anchor and
// travels inside the form.

export const dynamic = "force-dynamic";

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ADMIN_TEXT, DOMAIN_LABEL, MEMBER_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "admin.member.role.assign", "ui").allowed) {
    redirect("/admin/members");
  }
  const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const authz = { ...base, store: getAuthzStore() };
  const planning = { ...base, store: getPlanningStore() };
  const [members, roles, units, placements, territories] = await Promise.all([
    listWorkspaceMembers(authz),
    listRoles(authz),
    listOrgUnits(planning),
    listOrgMembers(planning),
    listTerritories(planning),
  ]);
  const all = members.ok ? members.value : [];
  const mine = all.find((m) => m.memberId === id);
  // An id nobody has is not an error page - the list is one click away.
  if (!mine) redirect("/admin/members");
  const roleRows = (roles.ok ? roles.value : []).map((r) => ({ code: r.code, name: r.name, admin: r.permissions.includes("admin.manage") }));
  const adminCodes = new Set(roleRows.filter((r) => r.admin).map((r) => r.code));
  const admins = all.filter((m) => m.status === "active" && m.roles.some((c) => adminCodes.has(c))).length;
  const lastAdmin = mine.status === "active" && mine.roles.some((c) => adminCodes.has(c)) && admins <= 1;
  const name = mine.displayName ?? mine.sub;

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.members, href: "/admin/members" },
        ]}
        current={name}
      />
      <ViewHeader title={name} description={MEMBER_TEXT.formWhy} />
      <MemberForm
        sub={mine.sub}
        name={name}
        status={mine.status}
        roles={roleRows}
        held={mine.roles}
        lastAdmin={lastAdmin}
        units={(units.ok ? units.value : []).map((u) => ({ id: u.id, name: u.name, depth: u.depth }))}
        unitId={(placements.ok ? placements.value : new Map<string, string>()).get(mine.sub) ?? null}
        scope={mine.scope}
        scopes={[...DATA_SCOPES]}
        territories={(territories.ok ? territories.value : []).map((t) => ({ id: t.id, name: t.name }))}
        territoryIds={mine.territoryIds}
      />
    </ViewLayout>
  );
}
