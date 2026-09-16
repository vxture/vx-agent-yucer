"use client";

import { Card, Stack } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { GateActions, GatePrimary, GateSignOut } from "./gate-actions";
import { GateFrame } from "./gate-frame";
import { GateHeading } from "./gate-heading";
import { PersonSummary, TenantSummary } from "./identity-summary";

// A member with no role, in a workspace that HAS subscribed.
//
// THE SAME SHAPE AS ITS SIBLING (owner, 2026-09-15). It had grown a paragraph
// under the title, a second paragraph inside the card explaining who the super
// administrator is, and a third under the buttons about being in the wrong
// workspace. All three are gone: the one fact worth the reader's time is who
// to ask, and that is now the single line under the title.
//
// It is still the only gate screen its reader cannot act on, which is why that
// line names a position rather than saying "an administrator" - opening the
// subscription makes you this product's super administrator (the platform's
// workspace:owner claim is the first-login super-admin, auth/lib/claims.ts, and
// authz/context.ts grants them the role that carries all 25 permissions), so
// there is always exactly one person it is talking about.
//
// The identity is on the page because that administrator will be looking for
// this member on a roster, and because being in the wrong workspace produces
// this exact screen - the workspace name settles that in one glance without a
// sentence about it.
//
// No subscribe button: a workspace that has already paid cannot fix a missing
// role by paying again, which is why lockoutReason separates the two states.

export function NoRoles({
  userName,
  userPhone,
  userPicture,
  orgLabel,
  workspaceLabel,
}: {
  readonly userName: string;
  readonly userPhone: string | null;
  readonly userPicture: string | null;
  readonly orgLabel: string | null;
  readonly workspaceLabel: string;
}) {
  const { SHELL_TEXT, NO_ROLES_TEXT, HEADER_TEXT } = useMessages();

  return (
    <GateFrame ariaLabel={NO_ROLES_TEXT.ariaLabel} width="narrow">
      <Stack gap="lg" className="items-center">
        {/* A key, because the subject is access: the workspace is paid for and
            the door is real, this member has not been handed what opens it. */}
        <GateHeading
          badge={NO_ROLES_TEXT.badge}
          badgeIcon="key"
          title={SHELL_TEXT.noRolesTitle}
          description={SHELL_TEXT.noRolesDescription}
        />

        <Card surface="soft" className="gap-md p-lg grid w-full grid-cols-2 text-left">
          <PersonSummary
            label={NO_ROLES_TEXT.identityLabel}
            name={userName}
            phone={userPhone}
            picture={userPicture}
          />
          <TenantSummary
            label={NO_ROLES_TEXT.workspaceLabel}
            orgLabel={orgLabel}
            orgFallback={HEADER_TEXT.tenantUnknown}
            workspaceLabel={workspaceLabel}
          />
        </Card>

        {/* The primary is a plain reload. The role arrives from somewhere else
            entirely - an administrator in another session - so there is nothing
            to poll and nothing this page could subscribe to; asking again is
            the whole mechanism, and the authz cache is 45s. */}
        <GateActions
          primary={<GatePrimary href="/">{NO_ROLES_TEXT.recheck}</GatePrimary>}
          secondary={<GateSignOut>{NO_ROLES_TEXT.signOut}</GateSignOut>}
        />
      </Stack>
    </GateFrame>
  );
}
