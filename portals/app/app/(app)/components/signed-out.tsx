"use client";

import { useEffect } from "react";
import { Icon, Stack } from "@vxture/design-ui";
import { SIGNED_OUT_COOKIE } from "../../auth/lib/signed-out-marker";
import { useMessages } from "../lib/i18n/provider";
import { GateActions, GatePrimary, GateSecondary } from "./gate-actions";
import { GateFrame } from "./gate-frame";

// After signing out.
//
// Reached by the IdP's post-logout redirect, which lands on the product root -
// the same address as the front door, because that is the URI registered with
// the platform. Without this the product answered a deliberate sign-out with
// "sign in", and a reader cannot tell a completed sign-out from a failed one.
//
// It says the act completed and offers the two places somebody might go next.
// It used to also carry a line restating the title and a note about closing the
// browser on a shared device; the owner cut both (2026-09-15) and they were
// filler - somebody who just signed out knows they signed out.

export function SignedOut({ consoleHref }: { readonly consoleHref: string | null }) {
  const { SIGNED_OUT_TEXT } = useMessages();

  // Consumed here rather than on the server: a layout cannot write a cookie,
  // and leaving it to expire would answer the next address the reader opens
  // with a sign-out notice they have already read. Cleared as this mounts, so
  // the confirmation shows exactly once.
  useEffect(() => {
    document.cookie = `${SIGNED_OUT_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }, []);

  return (
    <GateFrame ariaLabel={SIGNED_OUT_TEXT.ariaLabel} width="narrow">
      <Stack gap="lg" className="items-center text-center">
        {/* The mark, not a badge: a badge beside a heading saying the same
            words is the same sentence twice. A completed act, so it gets the
            tone's colour and nothing to read. */}
        <span
          aria-hidden
          className="bg-success-muted text-success-muted-foreground grid size-12 place-items-center rounded-full"
        >
          <Icon name="check" size={22} />
        </span>

        <h1 className="text-heading-2 text-balance">{SIGNED_OUT_TEXT.title}</h1>

        <GateActions
          primary={
            // The bare route, not a returnTo: the reader chose to leave, so the
            // place to come back to is the product's start rather than whatever
            // page the sign-out happened from.
            <GatePrimary href="/auth/login">{SIGNED_OUT_TEXT.signInAgain}</GatePrimary>
          }
          // Only when the console is configured - a button that goes nowhere is
          // worse than no button (lib/console-url.ts).
          secondary={
            consoleHref ? (
              <GateSecondary href={consoleHref}>{SIGNED_OUT_TEXT.toConsole}</GateSecondary>
            ) : undefined
          }
        />
      </Stack>
    </GateFrame>
  );
}
