"use client";

import { useEffect } from "react";
import { Stack } from "@vxture/design-ui";
import { SIGNED_OUT_COOKIE } from "../../auth/lib/signed-out-marker";
import { useMessages } from "../lib/i18n/provider";
import { GateActions, GatePrimary, GateSecondary } from "./gate-actions";
import { GateFrame } from "./gate-frame";
import { GateHeading } from "./gate-heading";

// After signing out.
//
// Reached by the IdP's post-logout redirect, which lands on the product root -
// the same address as the front door, because that is the URI registered with
// the platform. Without this the product answered a deliberate sign-out with
// "sign in", and a reader cannot tell a completed sign-out from a failed one.
//
// NO MARK ABOVE THE TITLE (owner, 2026-09-15). It carried a green tick in a
// disc, which is the shape a form uses to confirm something that might have
// failed. Signing out did not; the sentence is the confirmation.
//
// The one line under it is the only thing here the reader would not already
// know: this product ended its own session and can do nothing about the
// browser's. An instruction, not a reassurance, and it is why the line came
// back after being cut.

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
      <Stack gap="lg" className="items-center">
        <GateHeading
          title={SIGNED_OUT_TEXT.title}
          description={SIGNED_OUT_TEXT.description}
        />

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
