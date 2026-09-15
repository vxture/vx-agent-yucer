"use client";

import type { ReactNode } from "react";
import { Button } from "@vxture/design-ui";

// The action block the three refusal screens share.
//
// IT EXISTS BECAUSE THEY DRIFTED. Each screen grew its own way out, and by
// 2026-09-15 the sign-out on the no-subscription screen was a ghost button with
// no icon sitting under a paragraph, while the one on the no-role screen was a
// ghost button WITH an icon sitting under a different paragraph - two heights,
// two weights, two positions, for the same act. Three copies of "a primary and
// a secondary, stacked" is three chances to make them disagree; this is one.
//
// The shape: full width, primary on top, secondary under it, nothing between
// them. A refusal screen has exactly one thing to do and exactly one way out.

export function GateActions({
  primary,
  secondary,
}: {
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
}) {
  return (
    <div className="gap-sm flex w-full flex-col">
      {primary}
      {secondary}
    </div>
  );
}

/** The primary act of the screen. One per screen, always. */
export function GatePrimary({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Button asChild size="lg" className="w-full">
      <a href={href}>{children}</a>
    </Button>
  );
}

/** The way out, or the other door. Same size and weight on every screen. */
export function GateSecondary({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Button asChild variant="outline" size="lg" className="w-full">
      <a href={href}>{children}</a>
    </Button>
  );
}

/**
 * Signing out, which is a POST rather than a link.
 *
 * A real form, not a scripted click: these pages are one refusal each, and the
 * way off them must not depend on hydration. Same size and weight as
 * GateSecondary, because it is the same rank of action - see the shell's user
 * menu for the same POST.
 */
export function GateSignOut({ children }: { readonly children: ReactNode }) {
  return (
    <form method="post" action="/auth/logout" className="w-full">
      <Button type="submit" variant="outline" size="lg" className="w-full">
        {children}
      </Button>
    </form>
  );
}
