import type { ReactNode } from "react";
import { Button, EmptyState, ViewLayout } from "@vxture/design-ui";
import { subscribeUrl } from "../entitlement/deeplink";
import { resolveAppSession } from "./lib/session";
import { resolveNavigation, lockoutReason, ADMIN_NAV_ENTRIES, WORK_NAV_ENTRIES } from "./lib/navigation";
import { AppShell } from "./components/app-shell";
import { serviceIdentity } from "@vxture/shared";
import { BRAND } from "@yucer/shared/brand";
import { getAccountStore, getPipelineStore } from "../domains/shared/registry";
import { listAccounts } from "../domains/account/service";
import { listPipeline } from "../domains/pipeline/service";
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

/**
 * What to print beside the wordmark.
 *
 * serviceIdentity returns "unknown" for the sha when GIT_SHA is unset, which is
 * every local run - and "vunknown" in a header reads like a defect rather than
 * like a development build. Say "dev" when that is what it is; a version string
 * that cannot be traced to a build should not pretend to be one.
 */
function buildLabel(): string {
  const { gitSha } = serviceIdentity({
    service: `${BRAND.productCode}-app`,
    product: BRAND.productCode,
  });
  if (!gitSha || gitSha === "unknown") return process.env.APP_VERSION ?? "dev";
  return gitSha.slice(0, 7);
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await resolveAppSession();

  // No session: say so plainly. Auto-redirecting to the IdP from a layout would
  // bounce anyone who merely opened a stale tab.
  if (!session) {
    return (
      <ViewLayout>
        <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />
      </ViewLayout>
    );
  }

  const nav = resolveNavigation(session.authz, session.entitlement);
  const lockout = lockoutReason(nav);

  // Nothing reachable. WHICH nothing decides what to offer: a member whose
  // workspace has already paid cannot fix a missing role by paying again, and
  // sending them to checkout is worse than saying nothing.
  if (lockout === "no_roles") {
    return (
      <ViewLayout>
        <EmptyState title={SHELL_TEXT.noRolesTitle} description={SHELL_TEXT.noRolesDescription} />
      </ViewLayout>
    );
  }

  if (lockout === "no_entitlement") {
    return (
      <ViewLayout>
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
      </ViewLayout>
    );
  }

  // Three groups, and the split is the point of the rearrangement.
  //
  //   work    where a person acts - the judgement stream, and the copilot,
  //           which is where their decisions land.
  //   archive the seven object domains. They hold the data; nobody opens a
  //           customer list to find out what went wrong over the weekend.
  //   admin   outside the chain entirely.
  //
  // The copilot moves into WORK rather than out of the product: it is still D8
  // (ADR-001) and still in DOMAIN_NAV_ENTRIES. What changed is that it stopped
  // being the ninth item in a flat menu, which said it was one more optional
  // feature you might click.
  const adminKeys = new Set(ADMIN_NAV_ENTRIES.map((e) => e.key));
  const workKeys = new Set([...WORK_NAV_ENTRIES.map((e) => e.key), "copilot"]);
  const work = nav.filter((e) => workKeys.has(e.key));
  const domains = nav.filter((e) => !workKeys.has(e.key) && !adminKeys.has(e.key));
  const admin = nav.filter((e) => adminKeys.has(e.key));

  // What search can reach, assembled through the SAME services the pages use -
  // so a member cannot find by name what a page would refuse to show them.
  // Failures degrade to an empty list: search going quiet is a smaller harm
  // than the shell refusing to render.
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const [accounts, deals] = await Promise.all([
    listAccounts({ ...base, store: getAccountStore() }),
    listPipeline({ ...base, store: getPipelineStore() }),
  ]);
  const searchable = [
    ...(accounts.ok ? accounts.value : []).map((a) => ({
      key: `a:${a.id}`,
      label: a.name,
      description: a.industry ?? undefined,
      href: `/account/${a.id}`,
      group: "account" as const,
    })),
    ...(deals.ok ? deals.value : []).map((d) => ({
      key: `d:${d.id}`,
      label: d.name,
      description: d.accountName ?? d.opportunityNo,
      href: `/pipeline/${d.id}`,
      group: "deal" as const,
    })),
  ];

  return (
    <AppShell
      work={work}
      domains={domains}
      appVersion={buildLabel()}
      tier={session.entitlement.tier}
      searchable={searchable}
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
