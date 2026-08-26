import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Button, EmptyState, ViewLayout } from "@vxture/design-ui";
import { subscribeUrl } from "../entitlement/deeplink";
import { resolveAppSession, tenantIdOf } from "./lib/session";
import { resolveLocale } from "./lib/i18n/locale";
import { MessagesProvider } from "./lib/i18n/provider";
import { resolveNavigation, lockoutReason } from "./lib/navigation";
import { boardSections, agentPanel } from "./lib/board";
import { can } from "../authz/decide";
import { AppShell } from "./components/app-shell";
import { BOARD_COOKIE_PREFIX, DOCK_COOKIE_PREFIX } from "./lib/shell-cookies";
import { SignIn } from "./components/sign-in";
import { readNavCollapsed, serviceIdentity } from "@vxture/shared";
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
  // Three shapes, and only one of them takes a "v": a semver release does,
  // a commit sha does not, and "dev" is not a version at all.
  const declared = process.env.APP_VERSION;
  if (!gitSha || gitSha === "unknown") return declared ? `v${declared}` : "dev";
  return gitSha.slice(0, 7);
}

export default async function AppLayout({
  children,
  deck,
}: {
  children: ReactNode;
  /** The right deck, from the @deck parallel route - see @deck/deck-data.ts. */
  deck: ReactNode;
}) {
  const session = await resolveAppSession();
  // Resolved on the SERVER so the first paint is already in the right language.
  const locale = await resolveLocale();

  // No session: the product's front door, rendered in place. Auto-redirecting
  // to the IdP from a layout would bounce anyone who merely opened a stale tab,
  // and rendering here also KEEPS THE URL - so signing in returns to the page
  // that was actually asked for rather than to the home screen.
  //
  // It sits on this layout rather than on a route so it covers every route:
  // there is no address in the product that answers a session-less visitor
  // with anything else.
  if (!session) {
    return <SignIn />;
  }

  const nav = resolveNavigation(session.authz, session.entitlement);
  const lockout = lockoutReason(nav);

  // Nothing reachable. WHICH nothing decides what to offer: a member whose
  // workspace has already paid cannot fix a missing role by paying again, and
  // sending them to checkout is worse than saying nothing.
  if (lockout === "no_roles") {
    return (
      <ViewLayout>
        <EmptyState
          title={SHELL_TEXT.noRolesTitle}
          description={SHELL_TEXT.noRolesDescription}
        />
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
              <a href={subscribeUrl({ intent: "upgrade" })}>
                {SHELL_TEXT.subscribeCta}
              </a>
            </Button>
          }
        />
      </ViewLayout>
    );
  }

  // The sidebar's sections and their real numbers.
  //
  // Gathered here rather than in the page because the board belongs to the
  // SHELL - it is on screen for every route, so every route pays for it. That
  // cost is real and deliberate: a board that only knew the numbers on the home
  // screen would go stale the moment you navigated, which is worse than not
  // showing numbers at all.
  //
  // The judgement feed inside it is memoised per request (board.ts), so the
  // home page reusing it does not compute the most expensive read twice.
  // Administration still comes from the gate resolver, not the board: it is
  // setup rather than work, and it lives as a header icon.
  const admin = nav.filter((e) => e.key === "admin" || e.key === "adoption");

  // ONLY for the header badge. The deck itself is a parallel route now, so the
  // layout does not build it - but the count has to reach the header, and the
  // header is here. Unscoped on purpose: the badge answers "is anything waiting
  // for me anywhere", which is a question about the workspace even while you
  // are reading one account.
  const agent = await agentPanel(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
    },
    new Date(),
  );

  const board = await boardSections({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  });

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

  // The two flanks' states, read BEFORE rendering. Doing this on the client
  // instead would paint both flanks open and then jump - and here the jump is
  // the entire page layout, not a detail. Default is open: a first-time visitor
  // should see what the product is, and shutting a flank is one click.
  const jar = await cookies();
  const cookieString = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return (
    <MessagesProvider locale={locale}>
      <AppShell
        boardOpen={!readNavCollapsed(cookieString, BOARD_COOKIE_PREFIX)}
        dockOpen={!readNavCollapsed(cookieString, DOCK_COOKIE_PREFIX)}
        board={board}
        deck={deck}
        deckCount={agent.pending.length}
        appVersion={buildLabel()}
        tenantId={tenantIdOf(session)}
        locale={locale}
        /* APP_ENV, not a guess from the version string's shape. Beta ships a
         `beta-YYYYMMDD.N` tag and production ships `vX.Y.Z`, so inferring the
         tier from the label would make "is this production" depend on how
         someone named a tag. One explicit key, defaulting to non-production:
         a missing config should hide nothing it would be wrong to show, and
         showing a build badge in dev is harmless while hiding it in prod is
         the point. */
        isProduction={process.env.APP_ENV === "prod"}
        tier={session.entitlement.tier}
        searchable={searchable}
        admin={admin}
        userName={session.user.sub}
        // NOT the tier. The header already states the tier in its own badge, and
        // passing it here printed "enterprise" twice - once as the place you are
        // in and once as what you pay for, which are different facts.
        workspaceLabel={SHELL_TEXT.workspaceFallback}
        upgradeHref={subscribeUrl({ intent: "upgrade" })}
      >
        {children}
      </AppShell>
    </MessagesProvider>
  );
}
