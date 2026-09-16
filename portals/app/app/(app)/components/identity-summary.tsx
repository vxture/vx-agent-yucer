"use client";

import type { ReactNode } from "react";
import { Icon, UserAvatar } from "@vxture/design-ui";

// The two cells the gate screens' identity card shows: who is signed in, and
// which tenant/workspace they are in - shared so the two screens that carry
// this card (no-subscription, no-roles) never drift apart.
//
// NOT LabeledValue (2026-09-16): its value slot is `truncate` by design (a
// short reading, one line, ellipsis past it) - exactly the "读数框" the rules
// revision warns against for a name, which cuts a real person's name to a few
// characters and a workspace name off the back half of a shared line. Built
// directly instead, keeping LabeledValue's own two tokens (the label line's
// `text-label-sm text-muted-foreground`, the value line's `text-title-lg
// font-bold`) so the card still reads at the same weight - just without the
// truncation.

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2xs">
      <span className="text-label-sm text-muted-foreground truncate">{label}</span>
      {children}
    </div>
  );
}

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
    <Field label={label}>
      <div className="flex items-center gap-sm">
        <UserAvatar src={picture} alt={name} className="size-9 shrink-0" />
        <div className="flex min-w-0 flex-col">
          <span className="text-title-lg text-foreground font-bold text-balance">{name}</span>
          {phone && <span className="text-body-sm text-muted-foreground">{phone}</span>}
        </div>
      </div>
    </Field>
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
    <Field label={label}>
      <div className="flex items-center gap-sm">
        <Icon name="building-library" size="lg" className="text-muted-foreground shrink-0" />
        <div className="flex min-w-0 flex-col">
          <span className="text-title-lg text-foreground font-bold text-balance">{orgLabel ?? orgFallback}</span>
          <span className="text-body-sm text-muted-foreground">{workspaceLabel}</span>
        </div>
      </div>
    </Field>
  );
}
