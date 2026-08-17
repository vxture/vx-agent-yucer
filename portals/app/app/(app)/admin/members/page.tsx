import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import { SHELL_TEXT } from "../../lib/messages";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listWorkspaceMembers } from "../../../authz/admin";
import { MemberRoles } from "../../components/member-roles";
import { grantMemberRole, removeMemberRole } from "./actions";

// Member and role administration.
//
// Membership is LAZY: a row appears on the first sighting of (workspace, sub) at
// login, with no roles. So this list is "everyone who has ever signed in", not
// "everyone the platform says belongs here" - local_authz.member is deliberately
// not a real-time mirror of platform membership, and this screen does not try to
// make it one. Someone who has never logged in cannot be pre-assigned a role,
// which is a consequence of that design rather than an oversight.

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const result = await listWorkspaceMembers({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  });

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  return (
    <ViewLayout>
      <MemberRoles
        members={result.value}
        // Viewing and changing are separate actions on purpose: the list is
        // useful to anyone who can see it, and only an administrator gets the
        // controls.
        canManage={can(session.authz, session.entitlement, "admin.member.role.assign", "ui").allowed}
        onGrant={grantMemberRole}
        onRevoke={removeMemberRole}
      />
    </ViewLayout>
  );
}
