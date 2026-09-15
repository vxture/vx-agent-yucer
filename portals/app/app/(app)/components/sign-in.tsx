"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Stack } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { GateFrame } from "./gate-frame";

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
// WHAT IT SAYS, AND WHAT IT STOPPED SAYING (owner, 2026-09-15). The name, one
// sentence, the way in, and the chain. It briefly carried an eyebrow, a
// paragraph and three proposition cards; the owner cut them, and the reason
// holds: this address exists so somebody can sign in. The product is
// introduced on the public site, which the header links to.
//
// WHY THIS IS NOT AN EmptyState. EmptyState draws a dashed-border box, which
// means "this container has nothing in it". A front door is not an empty
// container.

export function SignIn() {
  const { SHELL_TEXT, SIGNIN_TEXT } = useMessages();

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
      <Stack gap="lg" className="items-center text-center">
        {/* The mark sits IN the heading, sized in em, so the two scale together
            and stay on one line at every breakpoint. Sized outside it, the
            logo held its pixels while the type stepped down and the lockup
            came apart on a phone. */}
        <h1 className="text-title-xl sm:text-display-sm gap-sm flex items-center justify-center">
          <img src="/logo.svg" alt="" aria-hidden className="h-[1.05em] w-auto" />
          {SHELL_TEXT.brandName}
        </h1>

        <p className="text-body-lg text-muted-foreground">{SIGNIN_TEXT.description}</p>

        <Button asChild size="xl" className="min-w-[240px]">
          <a href={href}>{SIGNIN_TEXT.cta}</a>
        </Button>
      </Stack>

      <Chain label={SIGNIN_TEXT.chainLabel} stops={SIGNIN_TEXT.chain} />
    </GateFrame>
  );
}

/**
 * The chain, shown rather than described.
 *
 * It is the product's central claim - strategy to cash, with a parent-child
 * relation at every hop - so the door draws the eight stops in order and lets
 * the reader follow them. An ordered list because the order IS the content;
 * the chevrons are decoration and are hidden from the reading order.
 */
function Chain({ label, stops }: { readonly label: string; readonly stops: readonly string[] }) {
  return (
    <nav aria-label={label} className="pt-2xl">
      <div className="gap-md flex items-center">
        <span className="border-primary/15 h-px flex-1 border-t" />
        <span className="text-overline text-muted-foreground">{label}</span>
        <span className="border-primary/15 h-px flex-1 border-t" />
      </div>

      <ol className="gap-x-xs gap-y-sm pt-md flex flex-wrap items-center justify-center">
        {stops.map((stop, i) => (
          <li key={stop} className="gap-x-xs flex items-center">
            <span className="text-label-sm border-primary/15 bg-card/70 px-sm py-2xs rounded-full border">
              {stop}
            </span>
            {/* AFTER its own stop, not before the next one. Leading it meant a
                line that wrapped on a phone began with a dangling chevron
                pointing at nothing. */}
            {i < stops.length - 1 && (
              <Icon
                name="chevron-right"
                size={12}
                aria-hidden
                className="text-muted-foreground/50"
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
