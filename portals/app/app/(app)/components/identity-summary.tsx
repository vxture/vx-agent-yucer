"use client";

import { Icon, UserAvatar } from "@vxture/design-ui";
import { formatPhone } from "../lib/format-phone";

// The two cells the gate screens' identity card shows: who is signed in, and
// which tenant/workspace they are in - shared so the two screens that carry
// this card (no-subscription, no-roles) never drift apart.
//
// NOT LabeledValue: its value slot is `truncate` by design (a short reading,
// one line, ellipsis past it) - exactly the "读数框" the rules revision warns
// against for a name, which cuts a real person's name to a few characters and
// a workspace name off the back half of a shared line.
//
// SIZED AND STRUCTURED AGAINST TENDERFORGE'S OWN LIVE PAGE (2026-09-16,
// owner: "两个页面都打开了，你照抄"), read directly off its DOM rather than
// guessed from the screenshot alone: `text-body-md` (14px) for BOTH lines -
// `font-medium` for the name/org line, `text-muted-foreground` (no extra
// weight) for the phone/workspace line beneath it - inside a plain
// `flex items-center gap-sm` cell with `min-w-0` on the text column and
// `break-words` on both spans. No caption above either cell - the avatar and
// the building icon are the label. The first version of this file used
// `text-title-lg font-bold` (LabeledValue's own value size) and later
// `text-label-lg` with `whitespace-nowrap` - both still too large or too
// eager to hold a real name/company name on one line; tenderforge's own
// choice is smaller than either and never forces single-line at the cost of
// cutting a genuinely long name, it just rarely needs to wrap at 14px inside
// this card's own width.

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
    <div className="flex min-w-0 items-center gap-sm" aria-label={label}>
      <UserAvatar src={picture} alt={name} className="size-10 shrink-0" />
      <div className="min-w-0">
        <p className="text-body-md font-medium break-words">{name}</p>
        {phone && <p className="text-body-md text-muted-foreground break-words">{formatPhone(phone)}</p>}
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
    <div className="flex min-w-0 items-center gap-sm" aria-label={label}>
      <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
        <Icon name="building-library" size="sm" />
      </span>
      <div className="min-w-0">
        <p className="text-body-md font-medium break-words">{orgLabel ?? orgFallback}</p>
        <p className="text-body-md text-muted-foreground break-words">{workspaceLabel}</p>
      </div>
    </div>
  );
}
