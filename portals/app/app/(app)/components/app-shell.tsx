"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ShellHeaderDivider,
  ShellIconButton,
  ShellProductTitle,
  ShellPreferencePanel,
  ShellPanelSlots,
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import {
  Separator,
  ShellHeader,
  ShellPageContainer,
  ShellViewport,
  StatusBadge,
} from "@vxture/design-ui";
import {
  LOCALE_CONFIGS,
  SUPPORTED_LOCALES,
  writeNavCollapsed,
  type Locale,
} from "@vxture/shared";
import { formatPhone } from "../lib/format-phone";
import { writeLocale } from "../lib/i18n/write-locale";
import type { ResolvedNavEntry } from "../lib/navigation";
import { DomainLauncher } from "./domain-launcher";
import { AdminNav } from "./admin-nav";
import { AgentDockButton } from "./agent-dock-button";
import { HeaderTools, SHELL_BODY_ID } from "./header-tools";
import { HeaderSearch } from "./header-search";
import { AVATAR_ON_LADDER, HEADER_ICON_CONTROL, HEADER_SEARCH_CONTROL, PRODUCT_TITLE_ON_LADDER } from "./header-ladder";
import { WorkspaceScope } from "./workspace-scope";
import type { BoardModuleCard } from "../lib/board";
// NOT a static import of the Chinese constants any more. This component is
// the shell - it renders on every page, in whatever language the request
// resolved to - so it reads the dictionary rather than one locale's copy of it.
import { useMessages } from "../lib/i18n/provider";
import { BOARD_COOKIE_PREFIX, DOCK_COOKIE_PREFIX } from "../lib/shell-cookies";
import { Tag } from "./tag";
import { PRODUCT_MARK_SRC } from "../lib/brand-assets";
import { CENTRE_PANE_CLASS, ASSISTANT_PANE_CLASS, isDossierRoute } from "../lib/sidebar-slot";
import { FormAssistSlotProvider } from "./form-assist-slot";

// Launcher switches business modules. Business pages use the available content
// width; only object dossiers and administration have a local left pane.
// The assistant remains a separate contextual surface on the right.

export interface AppShellProps {
  /** Gated module summaries displayed in the launcher. See board.ts. */
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
  /** access_token's `phone` - the identity line under the name. Null when the
   *  member never set one; the popover simply has one fewer line then. */
  readonly userPhone: string | null;
  readonly userEmail: string | null;
  /** access_token's `picture` - only present when the platform has a custom
   *  avatar on file (rare). Null falls back to the product's own default face. */
  readonly userPicture: string | null;
  /** The token's account_status; "active" reads as verified. Null when absent. */
  readonly accountStatus: string | null;
  /** Organization console; null hides the organization link. */
  readonly consoleUrl: string | null;
  readonly workspaceLabel: string;
  /** The tier itself, not its display label - null when unsubscribed. */
  readonly tier: string | null;
  /**
   * The tenant's display name, from the token's `active_org_name` (2026-09-16
   * rules revision). Null when the platform issued no name - the panel says
   * so rather than printing an empty row or a raw org id.
   */
  readonly orgLabel: string | null;
  readonly orgDisplayName: string | null;
  readonly orgLogoUrl: string | null;
  readonly activeOrgType: string | null;
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
  readonly adminNavOpen: boolean;
  readonly dockOpen: boolean;
  readonly children: ReactNode;
}

export function AppShell({
  boardModules,
  deck,
  deckCount,
  notificationsTotal = 0,
  notificationItems = [],
  nav,
  admin,
  userName,
  userPhone,
  userEmail,
  userPicture,
  accountStatus,
  consoleUrl,
  workspaceLabel,
  tier,
  orgLabel,
  orgDisplayName,
  orgLogoUrl,
  activeOrgType,
  locale,
  searchable,
  adminNavOpen,
  dockOpen,
  children,
}: AppShellProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { mode, setMode, density, setDensity, fontSize, setFontSize } = useTheme();
  const { DOMAIN_LABEL, HEADER_TEXT, SHELL_TEXT } = useMessages();

  // The first path segment IS the domain key: the routes are named for the
  // domains they serve, and DOMAIN_LABEL is keyed the same way. "/" is home.
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const activeKey = segments[0] ?? "home";

  // Object details own a dossier pane. It is content, not a module menu,
  // so the retired business-board preference must never hide it.
  const isDossierPage = isDossierRoute(segments);
  const [adminNavExpanded, setAdminNavExpanded] = useState(adminNavOpen);
  const [showDock, setShowDock] = useState(dockOpen);

  const isAdmin = segments[0] === "admin";
  const deckVisible = showDock;

  const toggleAdminNav = () =>
    setAdminNavExpanded((prev) => {
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
    <FormAssistSlotProvider>
    <ShellViewport
      // Administration uses the DS navigation slot. Business pages keep their
      // content and assistant in the body; object details also supply a dossier.
      sidebar={
        isAdmin ? (
          <AdminNav
            nav={admin}
            pathname={pathname}
            collapsed={!adminNavExpanded}
            onToggleCollapsed={toggleAdminNav}
          />
        ) : null
      }
      sidebarMode={isAdmin ? (adminNavExpanded ? "expanded" : "collapsed") : "hidden"}
      dock={!isAdmin && deckVisible ? (
        <aside className={ASSISTANT_PANE_CLASS}>{deck}</aside>
      ) : null}
      header={
        <ShellHeader
          // 单产品视角 (design-system 03 section 7.1, 13.5+): full width, the page
          // background, the DS's default workspace height (md, 48px).
          surface="background"
          className="gap-md"
          leading={
            <>
              {/* Module switching and its key figures live in one place. */}
              <DomainLauncher
                nav={nav}
                activeKey={activeKey}
                modules={boardModules}
              />

              {/* The signed-in workspace carries only the product identity. */}
              <ShellProductTitle
                /* Shared name/descriptor sizing and centered tier (TD-037). */
                className={PRODUCT_TITLE_ON_LADDER}
                logoSrc={PRODUCT_MARK_SRC}
                name={SHELL_TEXT.brandMark}
                type={SHELL_TEXT.brandTagline}
                tier={
                  // The DS's title-side corner badge is `xs` (16px) since design-ui
                  // 12; `sm` is the 20px default and read as a second name. The
                  // DS guide still says sm - it predates the five-step ladder.
                  <StatusBadge size="xs" tone={tier ? "brand" : "warning"} aria-label={HEADER_TEXT.subscriptionAria}>
                    {tier ? HEADER_TEXT.subscription(tier) : HEADER_TEXT.subscriptionNone}
                  </StatusBadge>
                }
              />
              {/* (7) THE CURRENT TENANT after the rule - the DS's product view
                  as of 13.5 (owner 2026-09-26: 按 DS 最新，只留租户按钮); the
                  functional domain it used to show here is gone from the header. */}
              <ShellHeaderDivider />
              <WorkspaceScope
                workspaceLabel={workspaceLabel}
                orgLabel={orgLabel}
                orgDisplayName={orgDisplayName}
                orgLogoUrl={orgLogoUrl}
                activeOrgType={activeOrgType}
                consoleUrl={consoleUrl}
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
            <HeaderSearch
              className={HEADER_SEARCH_CONTROL}
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
            /* Search-to-tools and cluster gaps use the same 16px token. */
            <div className="flex items-center gap-md">
              {/* (2) The agent deck's handle, and the only place the pending
                count is legible once the deck is shut. */}
              <AgentDockButton
                count={deckCount}
                open={showDock}
                onToggle={toggleDock}
              />

              {/* (3) The shell tools: help, messages, settings. */}
              <HeaderTools
                notifications={notificationsTotal}
                notificationItems={notificationItems}
                settingsHref={admin.some((e) => e.state === "visible") ? "/admin" : null}
              />

              {/* (4) The member, and their panel. */}
              {/* openLabel, or the trigger announces itself as "User menu" -
                  the DS's English fallback, and the one outlet the header audit
                  caught still defaulting. */}
              {/* DS identity, account link, preferences and session actions.
                  Organization context belongs to WorkspaceScope. */}
              <ShellUserMenu
                /* Match the native avatar with a 32px trigger (TD-037). */
                triggerClassName={AVATAR_ON_LADDER}
                openLabel={HEADER_TEXT.userMenuOpen}
                user={{
                  displayName: userName,
                  // No +86, 3-4-4 - the same as every other phone shown here.
                  uniqueLine: userPhone ? formatPhone(userPhone) : undefined,
                  meta: userEmail || undefined,
                  avatarSrc: userPicture?.trim() || undefined,
                  avatarAlt: userName,
                  statusTag: {
                    label: HEADER_TEXT.accountStatus(accountStatus),
                    // Account status is not an identity-verification claim.
                    verified: false,
                  },
                  badges: [],
                }}
                extras={
                  <ShellPanelSlots
                    label={HEADER_TEXT.userLevel}
                    lead="identity"
                    leadIcon="seal-check"
                    slots={[
                      { key: "identity", icon: "seal-check", label: HEADER_TEXT.userMedalIdentity },
                      { key: "security", icon: "shield", label: HEADER_TEXT.userMedalSecurity },
                      { key: "membership", icon: "star", label: HEADER_TEXT.userMedalMembership },
                      { key: "contribution", icon: "medal", label: HEADER_TEXT.userMedalContribution },
                      { key: "benefits", icon: "gift", label: HEADER_TEXT.userMedalBenefits },
                    ]}
                  />
                }
                links={[
                  { key: "account", label: HEADER_TEXT.accountCentre, href: "https://accounts.vxture.com/account", icon: "user-circle", newTab: true },
                ]}
                actions={[
                  {
                    key: "switch",
                    label: HEADER_TEXT.switchUser,
                    icon: "user-switch",
                    // A fresh authorize round with prompt=login: the IdP asks
                    // for credentials again, and the callback replaces this
                    // session with whoever signs in. A top-level navigation,
                    // as the RP contract requires of /auth/login.
                    onClick: () => window.location.assign("/auth/login?switch=1"),
                  },
                  {
                    key: "logout",
                    label: HEADER_TEXT.logout,
                    icon: "sign-out",
                    danger: true,
                    // POST /auth/logout ends the RP session and redirects to
                    // the IdP's end-session - a navigation, so a form, not a
                    // fetch that would swallow the redirect.
                    onClick: () => {
                      const form = document.createElement("form");
                      form.method = "post";
                      form.action = "/auth/logout";
                      document.body.appendChild(form);
                      form.submit();
                    },
                  },
                ]}
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
                    theme={mode}
                    density={density}
                    fontSize={fontSize}
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
                    onThemeChange={setMode}
                    onDensityChange={setDensity}
                    onFontSizeChange={setFontSize}
                  />
                }
              />
            </div>
          }
        />
      }
    >
      {isAdmin ? (
        <div id={SHELL_BODY_ID} className="flex h-full min-h-0">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <ShellPageContainer width="wide-2xl">{children}</ShellPageContainer>
          </div>
        </div>
      ) : (
        <div id={SHELL_BODY_ID} className="flex h-full min-h-0">
          {isDossierPage ? children : <div className={CENTRE_PANE_CLASS}>{children}</div>}
        </div>
      )}
    </ShellViewport>
    </FormAssistSlotProvider>
  );
}
