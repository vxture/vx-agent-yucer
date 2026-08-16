import type { ReactNode } from "react";
import { Button, EmptyState, PageStack } from "@vxture/design-system";
import { subscribeUrl } from "../entitlement/deeplink";
import { resolveAppSession } from "./lib/session";
import { resolveNavigation, lockoutReason, ADMIN_NAV_ENTRIES } from "./lib/navigation";
import { AppShell } from "./components/app-shell";
import { SHELL_TEXT } from "./lib/messages";

// The product shell.
//
// Rendered on the server so the navigation is computed from the real session,
// the real entitlement and the real membership - the client is handed the
// resolved answers, never the inputs to compute them itself. A client that could
// compute its own gate decisions could also compute different ones.
//
// The three lockout states are distinct on purpose and none of them renders the
// shell: there is nothing to navigate.

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
  const lockout = lockoutReason(nav);

  // Nothing reachable. WHICH nothing decides what to offer: a member whose
  // workspace has already paid cannot fix a missing role by paying again, and
  // sending them to checkout is worse than saying nothing.
  if (lockout === "no_roles") {
    return (
      <PageStack>
        <EmptyState title={SHELL_TEXT.noRolesTitle} description={SHELL_TEXT.noRolesDescription} />
      </PageStack>
    );
  }

  if (lockout === "no_entitlement") {
    return (
      <PageStack>
        <EmptyState
          title={SHELL_TEXT.noAccessTitle}
          description={SHELL_TEXT.noAccessDescription}
          // Intent is upgrade | renew | addon; the console route is already
          // /subscribe, so a first purchase reads as an upgrade from nothing.
          action={
            <Button asChild>
              <a href={subscribeUrl({ intent: "upgrade" })}>{SHELL_TEXT.subscribeCta}</a>
            </Button>
          }
        />
      </PageStack>
    );
  }

  // Split for the sidebar's three groups. The copilot is pulled OUT of the
  // domain list rather than left at its end: it cuts across all seven links of
  // the chain, and rendering it as their eighth peer would read as a stage that
  // comes after delivery.
  const adminKeys = new Set(ADMIN_NAV_ENTRIES.map((e) => e.key));
  const domains = nav.filter((e) => e.key !== "copilot" && !adminKeys.has(e.key));
  const copilot = nav.find((e) => e.key === "copilot") ?? null;
  const admin = nav.filter((e) => adminKeys.has(e.key));

  return (
    <AppShell
      domains={domains}
      copilot={copilot}
      admin={admin}
      activeKey={null}
      userName={session.user.sub}
      workspaceLabel={session.entitlement.tier ?? SHELL_TEXT.workspaceFallback}
      upgradeHref={subscribeUrl({ intent: "upgrade" })}
    >
      {children}
    </AppShell>
  );
}
