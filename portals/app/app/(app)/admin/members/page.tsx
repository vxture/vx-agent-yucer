import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listWorkspaceMembers } from "../../../authz/admin";
import { MemberRoles } from "../../components/member-roles";
import {
  changeMemberScope,
  grantMemberRole,
  removeMemberRole,
  setMemberActive,
  setMemberInactive,
} from "./actions";
import { listTerritories } from "../../../domains/planning/service";
import { getPlanningStore } from "../../../domains/shared/registry";
import { consoleMembersUrl } from "../../lib/console-url";
import { handOverBook } from "./handover";

import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
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
  const { LOAD_ERROR, MEMBER_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const result = await listWorkspaceMembers({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  });

  // The territories an administrator may assign. Read through the service so
  // both gates run - a page holding a store handle directly is the defect PR
  // #26 fixed on the account page.
  const territories = await listTerritories({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPlanningStore(),
  });

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(result.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <ViewHeader
        title={MEMBER_TEXT.title}
        description={MEMBER_TEXT.description}
      />
      <MemberRoles
        members={result.value}
        onDeactivate={setMemberInactive}
        onReactivate={setMemberActive}
        onHandover={handOverBook}
        onScope={changeMemberScope}
        territories={
          territories.ok
            ? territories.value.map((t) => ({ id: t.id, name: t.name }))
            : []
        }
        inviteUrl={consoleMembersUrl()}
        // Viewing and changing are separate actions on purpose: the list is
        // useful to anyone who can see it, and only an administrator gets the
        // controls.
        canManage={
          can(
            session.authz,
            session.entitlement,
            "admin.member.role.assign",
            "ui",
          ).allowed
        }
        onGrant={grantMemberRole}
        onRevoke={removeMemberRole}
      />
    </ViewLayout>
  );
}
