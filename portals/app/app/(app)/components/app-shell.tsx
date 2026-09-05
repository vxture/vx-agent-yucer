"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ShellBrand,
  ShellIconButton,
  ShellPreferencePanel,
  ShellSearchBox,
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import {
  Separator,
  ShellHeader,
  ShellViewport,
  StatusBadge,
} from "@vxture/design-ui";
import {
  LOCALE_CONFIGS,
  SUPPORTED_LOCALES,
  writeNavCollapsed,
  type Locale,
} from "@vxture/shared";
import { writeLocale } from "../lib/i18n/write-locale";
import type { ResolvedNavEntry } from "../lib/navigation";
import { DomainLauncher } from "./domain-launcher";
import { NavBoard } from "./nav-board";
import { AgentDockButton } from "./agent-dock-button";
import { HeaderTools, SHELL_BODY_ID } from "./header-tools";
import { WorkspaceScope } from "./workspace-scope";
import type { BoardModuleCard, BoardSection } from "../lib/board";
// NOT a static import of the Chinese constants any more. This component is
// the shell - it renders on every page, in whatever language the request
// resolved to - so it reads the dictionary rather than one locale's copy of it.
import { useMessages } from "../lib/i18n/provider";
import { BOARD_COOKIE_PREFIX, DOCK_COOKIE_PREFIX } from "../lib/shell-cookies";

// The pinned/archive split is gone (2026-08-31). It existed to rank a stack of
// route-keyed board cards - which ones stay open, which collapse - and the pane
// no longer has that stack: it has the queue and this domain's modules, and
// every one of those is worth a card. See nav-board.tsx.

// yucer's application shell: a command console, in three zones.
//
//   LEFT   - ours. Where things stand for our own side: quota, resource,
//            allies, the other fronts. NOT a menu; navigation is what these
//            cards happen to also do when clicked.
//   CENTRE - the engagement. One thing at a time, because deciding is done one
//            thing at a time.
//   RIGHT  - the agent, and what it is looking at.
//
// The header is a fourth, permanent thing, and its return is a correction.
//
// The previous shell dissolved the header into the two flanks - identity rode
// the own-forces panel, the tools rode the agent's - reasoning that a full-width
// bar reads as "document with a toolbar" rather than as a console. That holds
// for identity. It does not hold for the tools, because it made them CONDITIONAL
// ON A FLANK: the right flank was display:none below 1536px, so on a laptop the
// search box, the theme toggle, the administration door and the user menu were
// simply not on screen, with no control anywhere that could bring them back.
// Signing out required a wider monitor.
//
// So the tools now sit in a bar that is always there, and each flank holds only
// what it is about. That also gives the flanks somewhere to collapse TO: a panel
// you can shut but not reopen is a panel you can lose, so both toggles live
// outside the things they toggle.
//
// The two gate states render differently, and that asymmetry is deliberate:
// an ENTITLEMENT gap is advertised with the tier that would unlock it, because
// a feature nobody can see is a feature nobody buys. A PERMISSION gap is
// silent - resolveNavigation drops those entries before they reach here, so
// nobody is teased with a door only their colleague can open.

export interface AppShellProps {
  /** The sections and their real numbers, gathered server-side in board.ts. */
  readonly board: readonly BoardSection[];
  /** One card per module key, for the domain's navigation. See board.ts. */
  readonly boardModules: Record<string, BoardModuleCard>;
  /**
   * The right deck, as a SLOT rather than data.
   *
   * It arrives from the @deck parallel route, so the route that knows which
   * object is on screen supplies the deck for it. A layout cannot know that -
   * it has no params and cannot read the pathname - so a deck built here could
   * only ever report across the workspace, which on a detail page is not
   * clutter but a wrong answer.
   */
  readonly deck: ReactNode;
  /**
   * How many proposals the deck is holding, for the header badge.
   *
   * Passed separately BECAUSE the deck is opaque: it is a rendered node, and
   * the shell cannot count what is inside a node it did not build. The count
   * has to reach the header some other way, and a number beside the slot is
   * the honest version of that.
   */
  readonly deckCount: number;
  /** The bell's total and its queue list - see lib/notifications.ts. */
  readonly notificationsTotal?: number;
  readonly notificationItems?: readonly { key: string; count: number; href: string }[];
  /**
   * The member's resolved navigation, for the functional-domain launcher.
   *
   * The WHOLE resolved list, not just the eight domain entries: the launcher
   * also shows the home stream and the copilot above the five columns, and
   * both are resolved by the same call. Filtering here and re-adding two keys
   * in the launcher would put the membership rule in two places.
   */
  readonly nav: readonly ResolvedNavEntry[];
  /**
   * Administration. Reached from a single header icon rather than a sidebar
   * group: it is not work and not data, it is setup - visited rarely, and a
   * permanent group for it spends sidebar height on something nobody opens on
   * a Monday. Absent entirely when the member holds no admin permission, so the
   * icon is not a locked door they cannot do anything about.
   */
  readonly admin: readonly ResolvedNavEntry[];
  /**
   * REMOVED as a prop and derived here instead.
   *
   * The layout passed a literal `null` - it is a server component and cannot
   * read the pathname - so nothing on the board has ever highlighted, and the
   * domain control had nothing to name. Deriving it from usePathname() in this
   * client component is the only place that CAN know, and it fixes both at
   * once.
   */
  readonly userName: string;
  readonly workspaceLabel: string;
  readonly upgradeHref: string;
  /** Build identity, so a bug report can say which build it was seen on. */
  readonly appVersion: string;
  /** The tier itself, not its display label - null when unsubscribed. */
  readonly tier: string | null;
  /**
   * The tenant the workspace belongs to, from the token's `active_org`.
   * Null when the platform issued no org - the panel says so rather than
   * printing an empty row.
   */
  readonly tenantId: string | null;
  /**
   * True on a production deployment. The tier badge and the build label are
   * DEVELOPER-FACING: they answer "which build am I looking at" during
   * development and review. On a customer's screen the tier is a commercial
   * fact they did not ask to be reminded of on every page.
   */
  readonly isProduction: boolean;
  /** Resolved on the server so the first paint is already in this language. */
  readonly locale: Locale;
  /** What search can reach. Assembled on the server so it obeys both gates. */
  readonly searchable: readonly {
    key: string;
    label: string;
    description?: string;
    href: string;
    group: "account" | "deal";
  }[];
  /**
   * The flank states, READ ON THE SERVER from their cookies.
   *
   * Passed in rather than resolved here because the alternative is a first paint
   * with both flanks open followed by a jump once the client reads the cookie -
   * and the jump is the whole layout, not a detail. It is also why the cookie
   * contract lives in @vxture/shared rather than in the DS: a server layout has
   * to read it before rendering anything.
   */
  readonly boardOpen: boolean;
  readonly dockOpen: boolean;
  readonly children: ReactNode;
}

export function AppShell({
  board,
  boardModules,
  deck,
  deckCount,
  notificationsTotal = 0,
  notificationItems = [],
  nav,
  admin,
  userName,
  workspaceLabel,
  upgradeHref,
  appVersion,
  tier,
  tenantId,
  isProduction,
  locale,
  searchable,
  boardOpen,
  dockOpen,
  children,
}: AppShellProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const { DOMAIN_LABEL, HEADER_TEXT, SHELL_TEXT } = useMessages();

  // The first path segment IS the domain key: the routes are named for the
  // domains they serve, and DOMAIN_LABEL is keyed the same way. "/" is home.
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const activeKey = segments[0] ?? "home";

  /**
   * THE SHELL HAS TWO MODES, and this is the switch.
   *
   * A first-level page answers "how are things across the board", so the board
   * belongs beside it. A DETAIL page answers "how is THIS one thing" - and
   * those two questions compete for the same attention. On a detail page the
   * second one wins by definition: you are here because you chose this object.
   * The width it frees is a consequence, not the reason.
   *
   * Named routes rather than a pattern: /admin/members and /admin/adoption are
   * two segments deep and are NOT detail pages, they are first-level pages that
   * happen to live under a prefix. A rule keyed on segment count would have
   * stripped the board from them and been wrong in a way nobody would notice
   * until they went looking for it.
   */
  const DETAIL_ROOTS = ["account", "pipeline"];
  const isDetail = segments.length >= 2 && DETAIL_ROOTS.includes(segments[0]!);

  // Seeded from the server-read cookie, then owned by the client. The cookie is
  // written on each toggle rather than on unload, so the next full page load is
  // right even if this tab is killed.
  const [showBoard, setShowBoard] = useState(boardOpen);
  const [showDock, setShowDock] = useState(dockOpen);

  /** The board is shown when the member wants it AND the page has room for the
   *  question it answers. */
  // THE HOME SCREEN HAS NO NAVIGATION (owner ruling, 2026-08-31). It is the
  // list of what needs deciding today, spread across the full width - and a
  // menu beside it would be offering somewhere else to go to a person who has
  // just been handed the reason they opened the product. You choose a domain
  // from the launcher; the nav exists once you are inside one.
  const isHome = segments.length === 0;
  const boardVisible = showBoard && !isDetail && !isHome;

  const toggleBoard = () =>
    setShowBoard((prev) => {
      // The cookie stores COLLAPSED, so the value written is the state being
      // left behind, which is the one that is about to become "collapsed".
      writeNavCollapsed(BOARD_COOKIE_PREFIX, prev);
      return !prev;
    });

  const toggleDock = () =>
    setShowDock((prev) => {
      writeNavCollapsed(DOCK_COOKIE_PREFIX, prev);
      return !prev;
    });

  // Filtered here rather than fetched: the set is one workspace's accounts and
  // open deals, it already came down with the shell, and a round trip per
  // keystroke would buy nothing. It is also already gated - the server built
  // this list through the same services the pages use.
  const q = query.trim().toLowerCase();
  const hits =
    q === "" ? [] : searchable.filter((s) => s.label.toLowerCase().includes(q));
  const searchGroups =
    q === ""
      ? []
      : [
          {
            key: "account",
            heading: HEADER_TEXT.groupAccounts,
            items: hits.filter((h) => h.group === "account"),
          },
          {
            key: "deal",
            heading: HEADER_TEXT.groupDeals,
            items: hits.filter((h) => h.group === "deal"),
          },
        ]
          .filter((g) => g.items.length > 0)
          .map((g) => ({
            key: g.key,
            heading: g.heading,
            items: g.items.slice(0, 6).map((h) => ({
              key: h.key,
              label: h.label,
              description: h.description,
              onSelect: () => router.push(h.href),
            })),
          }));

  return (
    /* FOUR SURFACES, EACH OWNING ITS OWN SCROLL.

       ShellViewport is the DS's own shell and does three of the four things
       asked for by construction: h-dvh so the page itself never scrolls, the
       header shrink-0 inside it so it never leaves, and `main` with its own
       overflow-y-auto. Hand-rolling that would have duplicated a DS component
       to gain nothing.

       What it does NOT do is scroll the flanks independently or let a zone
       carry its own padding, so both of those ride on wrappers inside its
       slots - composition, not modification.

       PADDING IS PER ZONE. The top and the two outer sides sit at lg (24px),
       and the centre's top matches the flanks' or its first line starts above
       theirs, which reads as a misalignment rather than as a margin.

       THE BOTTOM IS pb-6xl (80px) IN ALL THREE, which is the DS's own safe
       area and its stated reason: scrolled to the end, the last row should not
       sit against the bottom of the viewport. Each zone owns its own scroll
       here, so each needs its own - a safe area on the page would not help a
       flank that scrolls independently of it.

       Each flank is flush on the side facing the centre, so its cards reach the
       boundary of their own zone instead of stopping short of it. The standoff
       between a flank and the centre's text therefore comes entirely from the
       CENTRE's px-page-inset: one source, rather than two paddings meeting in
       the middle and summing to something neither intended. That gutter stays
       fluid (clamp(lg, 3.2vw, 3xl)) - it is a different measurement from the
       body inset and answers a different question.

       The scrollbars land where they belong as a consequence - inside each
       zone, against the gutter - instead of one bar at the window's edge
       governing everything at once. */
    <ShellViewport
      /* THE DS SLOTS ARE NOT USED FOR THE FLANKS, and that is a considered
         departure. ShellSidebarFrame hardcodes w-sidebar-expanded (256px) and
         ShellViewport forwards it no className, so the nav pane could not be
         280 through that path - and the row it lays out carries no gap, so the
         32px between panes had to come from somewhere anyway. Both flanks are
         ordinary panes in `children` now; the viewport keeps what it is good
         at, which is the header and the h-dvh frame.

         The consequence to know: the collapse TRANSITION on the sidebar frame
         is gone. The flanks still collapse - they unmount - they just no longer
         animate their width. That is the price of the two widths and the gap. */
      sidebarMode="hidden"
      sidebar={null}
      header={
        <ShellHeader
          leading={
            <>
              {/* (1) The board toggle - ABSENT on a detail page, because the
                  board is. A toggle for something that is not there is a
                  control that does nothing, and this product has now removed
                  three of those for the same reason: the tier badge in
                  production, the caret over a menu of one, and this. */}
              {isDetail ? null : (
                <ShellIconButton
                  icon="sidebar"
                  label={
                    showBoard ? HEADER_TEXT.boardClose : HEADER_TEXT.boardOpen
                  }
                  onClick={toggleBoard}
                />
              )}

              {/* (2) The functional domain: NINE DOTS, no label, no fill.

                An app grid is a universal idiom and it does not need a word
                beside it; the 110px of text it used to carry made the second
                control in the header wider than the brand it sits before.
                The current domain is not lost - it moves to the panel, where
                the active row is marked, and that is a better place for it
                than a label that could only ever name one of the five.

                NOW LIVE. It is the only entrance to the eight domain pages -
                the left flank is the board and the right is the deck, neither
                of which is a menu - so while this was inert those routes were
                reachable only by typing the URL. */}
              <DomainLauncher
                nav={nav}
                activeKey={activeKey}
                upgradeHref={upgradeHref}
              />

              {/* (3)(4) Logo and product name. ShellBrand draws them as one
                lockup rather than as an image beside a word - the tag slot is
                the build label, which is part of the identity of what you are
                looking at, not a separate line of text. */}
              {/* The mark, SERVED FROM OUR OWN public/. The DS ships the
                  master under assets/ but deliberately does not export it, and
                  its README says why: "运行时应用把需要的资产拷进自己的
                  public/assets/... 自行伺服,不做跨包静态文件假设". Copied in,
                  not deep-imported past the package's exports map. */}
              <ShellBrand
                href="/"
                logoSrc="/assets/brand/vxture-logo-icon.svg"
                logoAlt={HEADER_TEXT.logoAlt}
                label={SHELL_TEXT.brandName}
                tag={isProduction ? undefined : HEADER_TEXT.version(appVersion)}
              />

              {/* (5) The tier, WITHOUT the word "档" - a Chinese measure word
                bolted onto an English identifier was neither - and absent
                entirely in production. */}
              {isProduction ? null : (
                <StatusBadge tone={tier ? "brand" : "neutral"}>
                  {tier
                    ? HEADER_TEXT.subscription(tier)
                    : HEADER_TEXT.subscriptionNone}
                </StatusBadge>
              )}

              {/* (6) The rule. It separates identity from scope: everything to
                its left is which PRODUCT this is, everything to its right is
                which DATA you are in. Those are different questions and they
                used to run together as two badges. */}
              <Separator orientation="vertical" className="h-control-sm" />

              {/* (7) Workspace and tenant. The isolation key every row and every
                gate decision is scoped by - a member with access to more than
                one has to know which they are reading before they read a single
                number, so it rides the header rather than a panel that can be
                shut. */}
              <WorkspaceScope
                workspaceLabel={workspaceLabel}
                tenantId={tenantId}
              />
            </>
          }
          /* SEARCH SITS AT THE RIGHT POLE, not centred. centerAlign="end" is the
           DS's own answer and its stated reason: it reads the header as two
           poles - identity on the left, tools on the right - and puts the
           centre slot into the right one. Centred, the search box was a third
           pole competing with both. */
          centerAlign="end"
          center={
            <ShellSearchBox
              query={query}
              onQueryChange={setQuery}
              groups={searchGroups}
              /* EVERY label passed, none defaulted. As of design-ui 5.0 the
               DS's own fallbacks are English, and its changelog is explicit
               that a default reaching a production interface means someone
               forgot to pass one rather than that a default was chosen. */
              labels={{
                placeholder: HEADER_TEXT.searchPlaceholder,
                empty: HEADER_TEXT.searchEmpty,
                loading: HEADER_TEXT.searchLoading,
                resultsLabel: HEADER_TEXT.searchResults,
              }}
            />
          }
          trailing={
            <>
              {/* (2) The agent deck's handle, and the only place the pending
                count is legible once the deck is shut. */}
              <AgentDockButton
                count={deckCount}
                open={showDock}
                onToggle={toggleDock}
              />

              {/* (3) The four shell tools. */}
              <HeaderTools
                notifications={notificationsTotal}
                notificationItems={notificationItems}
                /* FULLSCREEN TAKES THE DOCUMENT, header included. The earlier
                 version expanded only the shell body on the reasoning that the
                 header holds the way out - but the browser's own escape key
                 does, the DS wires it, and a "fullscreen" that leaves a bar on
                 screen is not the thing the button is named after. */
                fullscreenTarget={() => document.documentElement}
                onSettings={
                  admin.some((e) => e.state === "visible")
                    ? () => router.push("/admin")
                    : undefined
                }
              />

              {/* (4) The member, and their panel. */}
              {/* openLabel, or the trigger announces itself as "User menu" -
                  the DS's English fallback, and the one outlet the header audit
                  caught still defaulting. */}
              <ShellUserMenu
                openLabel={HEADER_TEXT.userMenuOpen}
                user={{
                  displayName: userName,
                  uniqueLine: workspaceLabel,
                  // The DS's own default face. The token carries no `picture`
                  // claim, and an <img> with no src is worse than a silhouette.
                  avatarSrc: "/assets/icons/avatar-default.svg",
                  avatarAlt: userName,
                }}
                /* LANGUAGE LIVES HERE, not in the header. It is set once and
                   then never again; a permanent header control for a
                   once-a-lifetime decision spends width every session to serve
                   the first one. The DS's preference panel already pairs it
                   with the theme, which is the other setting of exactly that
                   shape - and pairing them is why the theme toggle came out of
                   the header too. */
                settings={
                  <ShellPreferencePanel
                    locale={locale}
                    localeOptions={SUPPORTED_LOCALES.map((l) => ({
                      locale: l,
                      label: LOCALE_CONFIGS[l].nativeName,
                      nativeName: LOCALE_CONFIGS[l].nativeName,
                      flag: LOCALE_CONFIGS[l].flag,
                    }))}
                    theme={mode === "dark" ? "dark" : "light"}
                    labels={{
                      title: HEADER_TEXT.prefTitle,
                      locale: HEADER_TEXT.prefLocale,
                      theme: HEADER_TEXT.prefTheme,
                      themeOptions: {
                        light: HEADER_TEXT.prefThemeLight,
                        dark: HEADER_TEXT.prefThemeDark,
                        system: HEADER_TEXT.prefThemeSystem,
                      },
                      // Density and font size arrive with this panel whether
                      // asked for or not - showDensity/showFontSize default on
                      // - so they get labelled rather than hidden. Turning off
                      // working DS capability to avoid writing six words would
                      // be the worse trade; leaving them in English is not a
                      // trade at all.
                      density: HEADER_TEXT.prefDensity,
                      fontSize: HEADER_TEXT.prefFontSize,
                      densityOptions: {
                        compact: HEADER_TEXT.prefDensityCompact,
                        default: HEADER_TEXT.prefDensityDefault,
                        comfortable: HEADER_TEXT.prefDensityComfortable,
                      },
                      fontSizeOptions: {
                        small: HEADER_TEXT.prefFontSmall,
                        default: HEADER_TEXT.prefFontDefault,
                        large: HEADER_TEXT.prefFontLarge,
                      },
                    }}
                    onLocaleChange={(next) => {
                      // Cookie first, then refresh: the server owns the
                      // language, so the page has to be asked again rather
                      // than re-rendered from what the client already holds.
                      writeLocale(next as Locale);
                      router.refresh();
                    }}
                    onThemeChange={(next) => setMode(next as "light" | "dark")}
                  />
                }
              />
            </>
          }
        />
      }
    >
      {/* THE SHELL BODY: one inset, three panes, one gap.

          p-lg is the 24px inset on all four sides. The panes themselves carry
          NO padding - their cards reach their own edges - so the only
          horizontal space in here is the gap and the centre's own measure.

          gap-xl is 32px. Each pane owns its scroll, which is why the inset is
          on this row and not inside them: a pane that padded itself would
          scroll its own bottom padding away, and the safe area at the foot of
          a long list would vanish exactly when the list got long enough to
          need it. */}
      <div id={SHELL_BODY_ID} className="flex h-full min-h-0 gap-xl p-lg">
        {/* LEFT - ours. Cards that state where things stand; opening one
            navigates, but that is a consequence of the card, not its purpose. */}
        {boardVisible ? (
          <aside className="w-(--vx-pane-nav) min-h-0 shrink-0 overflow-y-auto">
            <NavBoard
              sections={board}
              modules={boardModules}
              activeKey={activeKey}
              pathname={pathname}
              nav={nav}
            />
          </aside>
        ) : null}

        {/* CENTRE - the engagement. Its 16px is the only horizontal padding
            in the body, and it is here rather than on the row because it is a
            MEASURE, not an inset: it keeps prose off the pane edge at any
            window width. pb-2xl is the scroll runway (owner, 2026-09-05):
            content that ends flush at the container's bottom edge reads as
            cut off, and the last table's rows sat on the fold with nothing
            below them. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-md pb-2xl">
          {children}
        </div>

        {/* RIGHT - the agent, and what it is looking at. */}
        {showDock ? (
          <aside className="w-(--vx-pane-action) min-h-0 shrink-0 overflow-y-auto">
            {deck}
          </aside>
        ) : null}
      </div>
    </ShellViewport>
  );
}
