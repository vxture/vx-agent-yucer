"use client";


import { useMessages } from "../lib/i18n/provider";
import { GateActions, GatePrimary, GateSignOut } from "./gate-actions";
import { GateFrame } from "./gate-frame";
import styles from "./public-page.module.css";
import { GateHeading } from "./gate-heading";
import { GateIdentity } from "./gate-identity";

// Role initialization precedes this fallback in the server layout. It remains
// for explicit restrictions and unavailable workspace role configuration, never
// as an onboarding step. Recheck is a real navigation, outside the router cache.

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
      <div className={styles.gateBody}>
        {/* A key, because the subject is access: the workspace is paid for and
            the door is real, this member has not been handed what opens it. */}
        <GateHeading
          badge={NO_ROLES_TEXT.badge}
          badgeIcon="key"
          title={SHELL_TEXT.noRolesTitle}
          description={SHELL_TEXT.noRolesDescription}
        />

        <GateIdentity
          personLabel={NO_ROLES_TEXT.identityLabel}
          tenantLabel={NO_ROLES_TEXT.workspaceLabel}
          name={userName} phone={userPhone} picture={userPicture}
          orgLabel={orgLabel} orgFallback={HEADER_TEXT.tenantUnknown}
          workspaceLabel={workspaceLabel}
        />

        {/* Authz never caches a roleless result: this navigation rechecks the
            server's current roles without requiring sign-out or a TTL wait. */}
        <GateActions
          primary={<GatePrimary href="/">{NO_ROLES_TEXT.recheck}</GatePrimary>}
          secondary={<GateSignOut>{NO_ROLES_TEXT.signOut}</GateSignOut>}
        />
      </div>
    </GateFrame>
  );
}
