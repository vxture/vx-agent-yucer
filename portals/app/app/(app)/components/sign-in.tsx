"use client";

import { useEffect, useState } from "react";
import { Button, Card, Icon, Stack, type IconName } from "@vxture/design-ui";
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
// WHY IT SAYS MORE THAN "SIGN IN" (2026-09-15). The door used to be a wordmark,
// one sentence and a button. That is honest for a member coming back from a
// stale tab and useless for everyone else who reaches this address - a buyer
// following a link, an administrator deciding whether to subscribe, a new hire
// checking they are in the right place. All of them were shown a login and no
// product. So the door now carries what the product claims, in the product's
// own words: the headline, the chain and the three propositions below are
// lifted from docs/20-specs/10-product-definition.md rather than written for
// the page, because a front door that makes a claim the spec does not make is
// a promise nobody signed off.
//
// WHY THIS IS NOT AN EmptyState. EmptyState draws a dashed-border box, which
// means "this container has nothing in it". A front door is not an empty
// container.
//
// WHY IT IS NOT UnifiedAuthPage EITHER. That is the PLATFORM's auth page: it
// forces a marketing visual panel on desktop and exists to host password /
// phone / social panels. This product has none of those - authentication is
// the platform's job and this page's whole content is one deliberate act.
// Borrowing that template would promise a login form we do not implement.

/** One icon per proposition, in the order the spec lists them. */
const PILLAR_ICONS: readonly IconName[] = ["tree-structure", "target", "list-checks"];

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
      <Stack gap="lg" className="items-center text-center">
        <span className="text-overline text-primary-text border-primary/20 bg-primary-muted/40 rounded-full border px-md py-2xs">
          {SIGNIN_TEXT.tagline}
        </span>

        {/* Steps down on a phone. display-sm is sized for a desktop hero and
            set three enormous lines at 375px, where the headline alone filled
            the screen and the button that is the whole point of the page was
            below the fold. */}
        <h1 className="text-title-xl sm:text-display-sm max-w-[20ch] text-balance">
          {SIGNIN_TEXT.headline}
        </h1>

        {/* 62ch is the repo's standing measure for a paragraph of judgement
            text - TD-007, the DS has no measure token. */}
        <p className="text-body-lg text-muted-foreground max-w-[56ch]">
          {SIGNIN_TEXT.lede}
        </p>

        <Stack gap="sm" className="items-center pt-xs">
          <Button asChild size="xl" className="min-w-[240px]">
            <a href={href}>{SIGNIN_TEXT.cta}</a>
          </Button>
          <p className="text-muted-foreground text-body-sm">{SIGNIN_TEXT.hint}</p>
        </Stack>
      </Stack>

      <Chain label={SIGNIN_TEXT.chainLabel} stops={SIGNIN_TEXT.chain} />

      <div className="gap-md pt-2xl grid grid-cols-1 sm:grid-cols-3">
        {SIGNIN_TEXT.pillars.map((pillar, i) => (
          <Card
            key={pillar.title}
            surface="soft"
            className="gap-sm p-lg flex flex-col text-left"
          >
            <Icon
              name={PILLAR_ICONS[i] ?? "placeholder"}
              size={20}
              className="text-primary-text"
            />
            <h2 className="text-title-sm">{pillar.title}</h2>
            <p className="text-body-sm text-muted-foreground">
              {pillar.description}
            </p>
          </Card>
        ))}
      </div>
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
