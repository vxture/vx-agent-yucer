import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { pricingUrl } from "../entitlement/deeplink";
import { resolveAppSession } from "./lib/session";
import { resolveLocale } from "./lib/i18n/locale";
import { buildMetadata } from "../metadata";
import { MessagesProvider } from "./lib/i18n/provider";
import { getMessages } from "./lib/i18n/server";
import { resolveNavigation, lockoutReason } from "./lib/navigation";
import { boardSections, agentPanel } from "./lib/board";
import { ADMIN_NAV_ENTRIES } from "./lib/admin-nav";
import { can } from "../authz/decide";
import { consoleUrl } from "./lib/console-url";
import { AppShell } from "./components/app-shell";
import { BOARD_COOKIE_PREFIX, DOCK_COOKIE_PREFIX } from "./lib/shell-cookies";
import { SignIn } from "./components/sign-in";
import { SignedOut } from "./components/signed-out";
import { NoSubscription } from "./components/no-subscription";
import { NoRoles } from "./components/no-roles";
import { SIGNED_OUT_COOKIE } from "../auth/lib/signed-out-marker";
import { readNavCollapsed } from "@vxture/shared";
import {
  getAccountStore,
  getDeliveryStore,
  getFieldStore,
  getPipelineStore,
} from "../domains/shared/registry";
import { listAccounts } from "../domains/account/service";
import { listPipeline, listPendingReviews } from "../domains/pipeline/service";
import { listCommitments } from "../domains/account/field-service";
import { listProjects, projectView } from "../domains/delivery/service";
import { notificationItems, notificationTotal } from "./lib/notifications";

// The product shell.
//
// Rendered on the server so the navigation is computed from the real session,
// the real entitlement and the real membership - the client is handed the
// resolved answers, never the inputs to compute them itself. A client that could
// compute its own gate decisions could also compute different ones.
//
// The three lockout states are distinct on purpose and none of them renders the
// shell: there is nothing to navigate.

// Locale-aware tab title for this whole group (2026-09-16), overriding the
// root layout's static default. Declared HERE rather than at the root: this
// layout already reads cookies() (resolveAppSession, resolveLocale) and is
// therefore already fully dynamic, so nesting the same requirement here costs
// nothing - putting it on the root layout instead made the (demo) route
// group's explicitly `force-static` preview pages dynamic too, since a parent
// layout's generateMetadata using dynamic APIs propagates to every child
// segment regardless of that child's own `dynamic` export.
export async function generateMetadata() {
  return buildMetadata(await resolveLocale());
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
  const { SHELL_TEXT } = await getMessages();

  // No session: the product's front door, rendered in place. Auto-redirecting
  // to the IdP from a layout would bounce anyone who merely opened a stale tab,
  // and rendering here also KEEPS THE URL - so signing in returns to the page
  // that was actually asked for rather than to the home screen.
  //
  // It sits on this layout rather than on a route so it covers every route:
  // there is no address in the product that answers a session-less visitor
  // with anything else.
  if (!session) {
    // WRAPPED, and every early return below is too.
    //
    // The provider used to sit only around the shell, so the three screens
    // that return before it - signed out, no roles, no subscription - were
    // outside it. A client component there calling useMessages() throws by
    // design (a silent Chinese fallback would hide the missing provider until
    // someone switched locale), which means the sign-in page could never be
    // translated at all: it is the FIRST thing an English reader sees.
    //
    // TWO SESSION-LESS SCREENS, not one. A visitor who has never signed in and
    // a member who just signed out arrive at the same address with the same
    // (absent) session, and answering both with "sign in" tells the second
    // that their sign-out failed. /auth/logout leaves a marker cookie on the
    // way to the IdP and this reads it - see auth/lib/signed-out-marker.ts for
    // why the product cannot simply be sent to a /signed-out route instead.
    const justSignedOut = (await cookies()).get(SIGNED_OUT_COOKIE)?.value === "1";
    return (
      <MessagesProvider locale={locale}>
        {justSignedOut ? <SignedOut consoleHref={consoleUrl()} /> : <SignIn />}
      </MessagesProvider>
    );
  }

  const nav = resolveNavigation(session.authz, session.entitlement);
  const lockout = lockoutReason(nav);

  // Nothing reachable. WHICH nothing decides what to offer: a member whose
  // workspace has already paid cannot fix a missing role by paying again, and
  // sending them to checkout is worse than saying nothing.
  if (lockout === "no_roles") {
    // The workspace has paid; this member has not been given a role. The one
    // refusal its reader cannot act on, so the screen names who can - whoever
    // opened the subscription is this product's super administrator
    // (authz/context.ts bootstraps them) - and shows the identity that
    // administrator will be searching a roster for.
    return (
      <MessagesProvider locale={locale}>
        <NoRoles
          userName={session.user.displayName}
          userPhone={session.user.phone}
          userPicture={session.user.picture}
          orgLabel={session.user.activeOrgName}
          workspaceLabel={session.user.activeWorkspaceName ?? SHELL_TEXT.workspaceFallback}
        />
      </MessagesProvider>
    );
  }

  if (lockout === "no_entitlement") {
    // A full screen rather than an EmptyState in a ViewLayout: EmptyState draws
    // a dashed box meaning "this container has nothing in it", and what is
    // actually happening is that the workspace has not bought the product. The
    // decision stays here; the component only renders it.
    return (
      <MessagesProvider locale={locale}>
        <NoSubscription
          // subscribe for a workspace that never subscribed, renew for one
          // that lapsed - the console shows a different flow for each, and
          // "upgrade from nothing" was the wrong CTA for a first purchase.
          subscribeHref={pricingUrl()}
          userName={session.user.displayName}
          userPhone={session.user.phone}
          userPicture={session.user.picture}
          orgLabel={session.user.activeOrgName}
          workspaceLabel={session.user.activeWorkspaceName ?? SHELL_TEXT.workspaceFallback}
        />
      </MessagesProvider>
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
  /* THE PLANE'S ENTRIES, from the registry rather than a hand-listed pair.
     It read `key === "admin" || key === "adoption"`, which was fine while the
     plane was two items and silently wrong the moment it became seven: the
     hub still listed them all (it filters by ADMIN_NAV_ENTRIES) while the
     plane's own menu showed the two that happened to be named here. */
  const adminKeys = new Set(ADMIN_NAV_ENTRIES.map((e) => e.key));
  const admin = nav.filter((e) => adminKeys.has(e.key));

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
    stores: session.stores,
    },
    new Date(),
  );

  const board = await boardSections({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    stores: session.stores,
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
    stores: session.stores,
  };
  const [accounts, deals, overdue, reviews, projects] = await Promise.all([
    listAccounts({ ...base, store: session.stores.account() }),
    listPipeline({ ...base, store: session.stores.pipeline() }),
    // The bell's three queues, through the SAME gated services their pages
    // use. A refusal counts as zero - the bell must not leak the size of work
    // a member is not allowed to see (lib/notifications.ts).
    listCommitments({ ...base, store: getFieldStore() }, { overdueAt: new Date(), limit: 100 }),
    listPendingReviews({ ...base, store: session.stores.pipeline() }),
    listProjects({ ...base, store: getDeliveryStore() }),
  ]);
  // Derived health lives on projectView, not on the row - same shape the
  // delivery page uses. One view per project is an N+1 that is fine at this
  // catalogue's size; the day it is not, the fix is a counting read on the
  // delivery service, not a cache here.
  const downgradedProjects = projects.ok
    ? (
        await Promise.all(
          projects.value.map(async (pr) => {
            const view = await projectView({ ...base, store: getDeliveryStore() }, pr.id);
            return view.ok && view.value.derivedHealth !== view.value.reportedHealth ? 1 : 0;
          }),
        )
      ).reduce((a: number, b: number) => a + b, 0)
    : 0;
  const bellItems = notificationItems({
    overdueCommitments: overdue.ok ? overdue.value.length : 0,
    pendingReviews: reviews.ok ? reviews.value.length : 0,
    downgradedProjects,
  });
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
        board={board.sections}
        boardModules={board.modules}
        deck={deck}
        deckCount={agent.pending.length}
        notificationsTotal={notificationTotal(bellItems)}
        notificationItems={bellItems}
        orgLabel={session.user.activeOrgName}
        locale={locale}
        /* NEXT_PUBLIC_APP_ENV, not a guess from the version string's shape.
         Beta ships a `beta-YYYYMMDD.N` tag and production ships `vX.Y.Z`, so
         inferring the tier from the label would make "is this production"
         depend on how someone named a tag. One explicit key, defaulting to
         non-production: a missing config should hide nothing it would be
         wrong to show, and showing a build badge in dev is harmless while
         hiding it in prod is the point.

         This line used to read APP_ENV === "prod" - a key no config declares
         AND a value the declared key never takes (.env.example ships
         NEXT_PUBLIC_APP_ENV=production). Doubly disconnected, so production
         would have shown the build badge it exists to hide. Found by the
         2026-08-30 connectivity audit's declared-vs-read env diff. */
        tier={session.entitlement.tier}
        searchable={searchable}
        nav={nav}
        admin={admin}
        userName={session.user.displayName}
        userPhone={session.user.phone}
        userPicture={session.user.picture}
        accountStatus={session.user.accountStatus}
        consoleUrl={consoleUrl()}
        // NOT the tier. The header already states the tier in its own badge, and
        // passing it here printed "enterprise" twice - once as the place you are
        // in and once as what you pay for, which are different facts.
        workspaceLabel={session.user.activeWorkspaceName ?? SHELL_TEXT.workspaceFallback}
        upgradeHref={pricingUrl()}
      >
        {children}
      </AppShell>
    </MessagesProvider>
  );
}
