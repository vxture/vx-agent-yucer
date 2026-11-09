"use client";

import { useEffect, useState } from "react";

import { LoginHome } from "./login-home";


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
// The Ruyin family landing page owns presentation; this wrapper preserves
// deep-link returnTo and the existing one-shot silent SSO recovery.

export function SignIn({ resume = false }: { readonly resume?: boolean }) {
  // Built client-side because a server layout cannot see the path. Starts as
  // the bare route so the markup is a real link before hydration and with JS
  // off - the returnTo is an upgrade, never a precondition for signing in.
  const [href, setHref] = useState("/auth/login");

  useEffect(() => {
    const here = window.location.pathname + window.location.search;
    setHref(`/auth/login?returnTo=${encodeURIComponent(here)}`);
    // A session that died while the IdP's own session is alive: try the IdP
    // once, silently, before asking anybody to click (auth/lib/sso.ts
    // shouldResumeSilently). A hard navigation, from here, because this may
    // be a client-side route change and the IdP hop must be top-level. The
    // login route sets the marker that makes this happen once, not forever.
    if (resume) window.location.replace(`/auth/login?silent=1&returnTo=${encodeURIComponent(here)}`);
  }, [resume]);

  return <LoginHome href={href} resume={resume} />;
}
