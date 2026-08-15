import type { ReactNode } from "react";
import { EmptyState, PageStack } from "@vxture/design-system";
import { subscribeUrl } from "../entitlement/deeplink";
import { resolveAppSession } from "./lib/session";
import { resolveNavigation, isFullyLockedOut } from "./lib/navigation";
import { DomainNav } from "./components/domain-nav";
import { SHELL_TEXT } from "./lib/messages";

// The product shell.
//
// Rendered on the server so the navigation is computed from the real session,
// the real entitlement and the real membership - the client is handed the
// resolved answers, never the inputs to compute them itself. A client that could
// compute its own gate decisions could also compute different ones.

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await resolveAppSession();

  // No session: say so plainly. Auto-redirecting to the IdP from a layout would
  // bounce anyone who merely opened a stale tab.
  if (!session) {
    return (
      <PageStack>
        <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />
      </PageStack>
    );
  }

  const nav = resolveNavigation(session.authz, session.entitlement);

  // Entitled to nothing at all: the conversion exit is the only useful thing on
  // the page, so it is the whole page rather than a banner above an empty shell.
  if (isFullyLockedOut(nav)) {
    return (
      <PageStack>
        <EmptyState
          title={SHELL_TEXT.noAccessTitle}
          description={SHELL_TEXT.noAccessDescription}
          // Intent is upgrade | renew | addon; the console route is already
          // /subscribe, so a first purchase reads as an upgrade from nothing.
          action={<a href={subscribeUrl({ intent: "upgrade" })}>{SHELL_TEXT.subscribeCta}</a>}
        />
      </PageStack>
    );
  }

  return (
    <PageStack>
      <DomainNav entries={nav} upgradeHref={subscribeUrl({ intent: "upgrade" })} />
      {children}
    </PageStack>
  );
}
