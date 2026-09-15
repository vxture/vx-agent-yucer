"use client";

import { useEffect } from "react";
import { Button, Icon, Stack } from "@vxture/design-ui";
import { SIGNED_OUT_COOKIE } from "../../auth/lib/signed-out-marker";
import { useMessages } from "../lib/i18n/provider";
import { GateFrame } from "./gate-frame";

// After signing out.
//
// Reached by the IdP's post-logout redirect, which lands on the product root -
// the same address as the front door, because that is the URI registered with
// the platform. Without this the product answered a deliberate sign-out with
// "sign in", and a reader cannot tell a completed sign-out from a failed one.
//
// It says the session ended, offers the two things somebody might want next,
// and says the one thing the product cannot do for them: end the sign-out by
// closing a browser window somebody else is about to use.

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
        {/* The mark, not a badge: a badge beside a heading that says the same
            words is the same sentence twice. This is a completed act, so it
            gets the tone's own colour and nothing to read. */}
        <span
          aria-hidden
          className="bg-success-muted text-success-muted-foreground grid size-12 place-items-center rounded-full"
        >
          <Icon name="check" size={22} />
        </span>

        <h1 className="text-heading-2 text-balance">{SIGNED_OUT_TEXT.title}</h1>

        <p className="text-body-md text-muted-foreground">
          {SIGNED_OUT_TEXT.description}
        </p>

        <Stack gap="sm" className="w-full items-center">
          <Button asChild size="xl" className="w-full">
            {/* The bare route, not a returnTo: the reader chose to leave, so
                the place to come back to is the product's own start rather
                than whatever page the sign-out happened from. */}
            <a href="/auth/login">{SIGNED_OUT_TEXT.signInAgain}</a>
          </Button>

          {/* Only when the console is configured. A button that goes nowhere
              is worse than no button - see lib/console-url.ts. */}
          {consoleHref && (
            <Button asChild variant="outline" size="lg" className="w-full">
              <a href={consoleHref}>{SIGNED_OUT_TEXT.toConsole}</a>
            </Button>
          )}
        </Stack>

        <p className="gap-sm text-body-sm text-muted-foreground flex items-center">
          <Icon name="info" size={14} aria-hidden />
          {SIGNED_OUT_TEXT.publicDeviceNote}
        </p>
      </Stack>
    </GateFrame>
  );
}
