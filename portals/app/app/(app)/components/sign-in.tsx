"use client";

import { useEffect, useState } from "react";
import { Button, Stack } from "@vxture/design-ui";
import { ShellBrand } from "@vxture/design-system";
import { SHELL_TEXT, SIGNIN_TEXT } from "../lib/messages";

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
// WHY THIS IS NOT AN EmptyState. EmptyState draws a dashed-border box, which
// means "this container has nothing in it". A front door is not an empty
// container, and the previous signed-out screen looked like a placeholder
// precisely because it used one.
//
// WHY IT IS NOT UnifiedAuthPage EITHER. That is the PLATFORM's auth page: it
// forces a marketing visual panel on desktop and exists to host password /
// phone / social panels. This product has none of those - authentication is
// the platform's job and this page's whole content is one deliberate act.
// Borrowing that template would promise a login form we do not implement.
//
// So it is composed from DS primitives on DS tokens, which is also what the DS
// itself now prescribes: styles/auth.css is retired, and its own note says the
// auth surfaces are to be rebuilt with utility classes.

export function SignIn() {
  // Built client-side because a server layout cannot see the path. Starts as
  // the bare route so the markup is a real link before hydration and with JS
  // off - the returnTo is an upgrade, never a precondition for signing in.
  const [href, setHref] = useState("/auth/login");

  useEffect(() => {
    const here = window.location.pathname + window.location.search;
    setHref(`/auth/login?returnTo=${encodeURIComponent(here)}`);
  }, []);

  return (
    <main className="bg-background relative grid min-h-screen place-items-center overflow-hidden">
      <Ambience />

      <section
        aria-label={SIGNIN_TEXT.ariaLabel}
        className="relative w-full max-w-[390px] px-lg text-center"
      >
        <Stack gap="lg" className="items-center">
          {/* The same lockup as the header. A door that introduces the product
              with different marks than the room behind it reads as two
              products. */}
          <ShellBrand href="/" label={SHELL_TEXT.brandName} />

          <p className="text-muted-foreground text-sm leading-relaxed">
            {SIGNIN_TEXT.description}
          </p>

          <Button asChild size="xl" className="w-full">
            <a href={href}>{SIGNIN_TEXT.cta}</a>
          </Button>

          <p className="text-muted-foreground text-xs">{SIGNIN_TEXT.hint}</p>
        </Stack>
      </section>
    </main>
  );
}

/**
 * The drifting field behind the door.
 *
 * STOPGAP - registered as TD-005. The design system has no ambient background
 * element, and its auth stylesheet was retired rather than replaced, so there
 * is nothing to compose here. Recovery is to delete this and consume the DS
 * element once one exists.
 *
 * What keeps it inside the rules meanwhile: it takes every colour from a DS
 * token and defines none. The mockup's #2563eb / #cbdff5 are not reproduced -
 * they are read from --primary, so the field follows the brand and both themes
 * instead of pinning one palette into the product. It is decoration only:
 * aria-hidden, no pointer events, and nothing here carries meaning.
 */
function Ambience() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg
        // STATIC, deliberately. The mockup drifts these lines over 18s, which
        // needs a @keyframes this repo would have to define itself - a motion
        // value invented in a product repo, and the DS ships exactly one
        // keyframe and no motion tokens. Recorded in TD-005 with the element
        // itself rather than smuggled in; the field reads as intended without
        // it, and motion is the part that costs least to wait for.
        className="text-primary absolute inset-[-8%] h-[116%] w-[116%] opacity-40"
        viewBox="0 0 1600 1000"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
      >
        <path d="M-80 690 C220 430,360 790,650 570 S1080 300,1680 480" />
        <path d="M-100 760 C220 500,390 850,690 620 S1130 360,1700 540" opacity={0.7} />
        <path d="M-120 830 C230 570,420 900,720 675 S1180 420,1710 600" opacity={0.45} />
        <path d="M-60 600 C240 360,390 680,610 500 S1070 240,1640 410" opacity={0.3} />
      </svg>

      {/* The wash. Without it the lines run under the wordmark and the door
          stops being legible - the field has to fade where the reading is. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,var(--background)_0%,var(--background)_30%,transparent_74%)]" />
    </div>
  );
}
