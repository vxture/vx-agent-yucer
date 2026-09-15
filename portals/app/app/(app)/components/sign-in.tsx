"use client";

import { useEffect, useState } from "react";
import { Button, Stack } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { GateFrame } from "./gate-frame";
import { GateHeading } from "./gate-heading";

// The product's front door.
//
// Reached by typing the domain, and by opening ANY route without a session -
// which is why it renders in place rather than redirecting. Two reasons, and
// the second is the load-bearing one:
//
//   1. A redirect to the IdP would bounce anyone who merely opened a stale tab.
//   2. Rendering in place keeps the URL, so returnTo carries the exact page
//      they asked for. Redirect first and that address is gone; the best you
//      could then offer is the home screen, which is not where they were going.
//
// WHAT IS LEFT HERE IS THE MIDDLE BAND ONLY. The product's name and mark are
// the frame's top band and the chain is its bottom band, because both belong
// on all four gate screens rather than on this one. This file is down to the
// sentence and the way in, which is what a door is: the product is introduced
// on the public site, which the header links to.

export function SignIn() {
  const { SIGNIN_TEXT } = useMessages();

  // Built client-side because a server layout cannot see the path. Starts as
  // the bare route so the markup is a real link before hydration and with JS
  // off - the returnTo is an upgrade, never a precondition for signing in.
  const [href, setHref] = useState("/auth/login");

  useEffect(() => {
    const here = window.location.pathname + window.location.search;
    setHref(`/auth/login?returnTo=${encodeURIComponent(here)}`);
  }, []);

  return (
    <GateFrame ariaLabel={SIGNIN_TEXT.ariaLabel} width="wide">
      <Stack gap="lg" className="items-center">
        {/* The same heading shape as the three refusals - a greeting and the
            product's one sentence. The door had only the sentence, which left
            this band looking unfinished. */}
        <GateHeading title={SIGNIN_TEXT.title} description={SIGNIN_TEXT.description} />

        <Button asChild size="xl" className="min-w-[240px]">
          <a href={href}>{SIGNIN_TEXT.cta}</a>
        </Button>
      </Stack>
    </GateFrame>
  );
}
