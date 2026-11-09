"use client";

import styles from "./public-page.module.css";
import { Icon, UserAvatar } from "@vxture/design-ui";
import { formatPhone } from "../lib/format-phone";

// Shared public-gate identity cells. Keep full names and workspace labels
// readable; the container stacks these cells on small screens.

export function PersonSummary({
  label,
  name,
  phone,
  picture,
}: {
  readonly label: string;
  readonly name: string;
  /** access_token's `phone` - the line under the name. Null omits it rather
   *  than repeating the name or a placeholder. */
  readonly phone: string | null;
  /** access_token's `picture` - null/undefined falls back to the platform's
   *  own default silhouette (UserAvatar's own rule). */
  readonly picture: string | null;
}) {
  return (
    <div className={styles.identityCell} aria-label={label}>
      <UserAvatar src={picture} alt={name} className={styles.identityAvatar} />
      <div className="min-w-0">
        <p className={styles.identityName}>{name}</p>
        {phone && <p className={styles.identityMeta}>{formatPhone(phone)}</p>}
      </div>
    </div>
  );
}

export function TenantSummary({
  label,
  orgLabel,
  orgFallback,
  workspaceLabel,
}: {
  readonly label: string;
  /** access_token's `active_org_name` - null falls back to `orgFallback`
   *  rather than a raw org id (2026-09-16 rules revision). */
  readonly orgLabel: string | null;
  readonly orgFallback: string;
  readonly workspaceLabel: string;
}) {
  return (
    <div className={styles.identityCell} aria-label={label}>
      <span className={styles.identityIcon}>
        <Icon name="building-library" size="sm" />
      </span>
      <div className="min-w-0">
        <p className={styles.identityName}>{orgLabel ?? orgFallback}</p>
        <p className={styles.identityMeta}>{workspaceLabel}</p>
      </div>
    </div>
  );
}
