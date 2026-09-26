"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ShellHeaderDivider,
  ShellHeaderDomain,
  ShellHeaderMark,
  ShellIconButton,
  ShellProductTitle,
  ShellPreferencePanel,
  ShellSearchBox,
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import {
  Separator,
  ShellHeader,
  ShellPageContainer,
  ShellViewport,
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
import { AdminNav } from "./admin-nav";
import { AgentDockButton } from "./agent-dock-button";
import { HeaderTools, SHELL_BODY_ID } from "./header-tools";
import { WorkspaceScope } from "./workspace-scope";
import type { BoardModuleCard, BoardSection } from "../lib/board";
// NOT a static import of the Chinese constants any more. This component is
// the shell - it renders on every page, in whatever language the request
// resolved to - so it reads the dictionary rather than one locale's copy of it.
import { useMessages } from "../lib/i18n/provider";
import { BOARD_COOKIE_PREFIX, DOCK_COOKIE_PREFIX } from "../lib/shell-cookies";
import { Tag } from "./tag";
import { BRAND_MARK_SRC, PRODUCT_MARK_SRC } from "../lib/brand-assets";
import { activeDomainFromPath } from "../lib/functional-domains";
import { BOARD_PANE_CLASS, CENTRE_PANE_CLASS, isDossierRoute } from "../lib/sidebar-slot";

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
  /** access_token's `phone` - the identity line under the name. Null when the
   *  member never set one; the popover simply has one fewer line then. */
  readonly userPhone: string | null;
  /** access_token's `picture` - only present when the platform has a custom
   *  avatar on file (rare). Null falls back to the product's own default face. */
  readonly userPicture: string | null;
  /** The token's account_status; "active" reads as verified. Null when absent. */
  readonly accountStatus: string | null;
  /** The console's account centre; null hides the link. */
  readonly consoleUrl: string | null;
  readonly workspaceLabel: string;
  readonly upgradeHref: string;
  /** The tier itself, not its display label - null when unsubscribed. */
  readonly tier: string | null;
  /**
   * The tenant's display name, from the token's `active_org_name` (2026-09-16
   * rules revision). Null when the platform issued no name - the panel says
   * so rather than printing an empty row or a raw org id.
   */
  readonly orgLabel: string | null;
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
  userPhone,
  userPicture,
  accountStatus,
  consoleUrl,
  workspaceLabel,
  upgradeHref,
  tier,
  orgLabel,
  locale,
  searchable,
  boardOpen,
  dockOpen,
  children,
}: AppShellProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const { DOMAIN_LABEL, DOMAIN_GROUP_LABEL, HEADER_TEXT, SHELL_TEXT } = useMessages();

  // The first path segment IS the domain key: the routes are named for the
  // domains they serve, and DOMAIN_LABEL is keyed the same way. "/" is home.
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const activeKey = segments[0] ?? "home";
  const activeDomain = activeDomainFromPath(pathname);
  const domainLabel = activeDomain ? (DOMAIN_GROUP_LABEL[activeDomain] ?? null) : null;

  // THE SHELL HAS ONE MODE (owner, 2026-09-24: 整个产品中, 不能存在横跨2栏,
  // 3栏的板块, 除了header). There used to be a "detail" mode that dropped the
  // board on /pipeline/<id> so the deal page could take 栏1's width - the same
  // defect the account detail page had until 2026-09-20. A page may put its own
  // content into 栏1 (the account dossier does), but no page removes a column.
  /** 栏1 取代通用模块导航, 不是并排加一个 (owner, 2026-09-20: 死死记住这次的
   *  要求 - "整体页面是三栏，不是内容区还是两栏"). 客户详情路由下, 这一侧的
   *  <aside> 还是同一个(宽度/独立滚动都不变, 见下面 boardVisible 的渲染),
   *  只是内容从 NavBoard 换成这个客户自己的档案 - account-sidebar-portal.tsx
   *  把 page.tsx 已经建好的栏1内容传送到这里, 不重新发起一次数据读。 */
  const isDossierPage = isDossierRoute(segments);

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

  /* 配置管理 IS A PLANE OF ITS OWN (owner, 2026-09-08), and the body below
     branches on it rather than filtering pieces out of one row: inside it the
     business board is replaced by the plane's own menu, the copilot deck does
     not render at all, and the spacing is the plane's own (2026-09-09). A deck
     pushing today's deals beside a permission matrix is noise, and the board
     would be a second answer to "where am I".

     The two flags below are therefore about the BUSINESS body only - the admin
     branch renders neither flank, so neither flag needs to name it. */
  const isAdmin = segments[0] === "admin";
  const boardVisible = showBoard && !isHome;
  const deckVisible = showDock;

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

       THE BOTTOM SAFE AREA BELONGS INSIDE THE SCROLLING ELEMENT, ON EVERY
       ZONE THAT SCROLLS (corrected 2026-09-17: the nav flank had none - the
       centre's own pb-2xl below is the reference this followed). The point of
       the padding is that scrolling to the end still reaches the true bottom,
       with the last row landing a safe distance short of the viewport edge -
       not a shorter scrollable box. Padding on a wrapper OUTSIDE the
       overflow-y-auto element does the opposite: it shrinks how far the zone
       can scroll, which reads as the list being cut off before its own end.
       Each zone owns its own scroll, so each needs its own copy of this -  a
       safe area on the page would not help a flank that scrolls independently
       of it.

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
         animate their width. That is the price of the two widths and the gap.

         配置管理 IS THE EXCEPTION, and it goes through the slot (2026-09-08).
         Its menu is the DS's own ShellSidebarNav, built for exactly this
         placement: flush to the viewport edge, full height, its own width and
         collapse transition. Rendering it as a pane inside the padded row
         instead put 24px of our padding and a 32px gap around a component that
         already carries its own - a frame nobody asked for, and the nav pushed
         off the edge it is meant to sit on. */
      sidebar={
        isAdmin ? (
          <AdminNav
            nav={admin}
            pathname={pathname}
            collapsed={!showBoard}
            onToggleCollapsed={toggleBoard}
          />
        ) : null
      }
      sidebarMode={isAdmin ? (showBoard ? "expanded" : "collapsed") : "hidden"}
      header={
        <ShellHeader
          // 单产品视角 (design-system 03 §7.1): full width, the page background,
          // the xl height every workspace view shares.
          height="xl"
          surface="background"
          leading={
            <>
              {/* (1) THE BOARD TOGGLE - restored (owner, 2026-09-21: 恢复侧边栏
                  展开收起按钮 - 这是"整体页面 header"里的那一个, 不是账户详情页
                  侧栏自己顶部的功能条那个, 两者管的是不同的开关). 一度在
                  2026-09-14(#309) 被撤掉, 理由是"detail 页面根本没有 board,
                  一个切换不存在东西的按钮是死按钮" - 那时 account detail 也在
                  DETAIL_ROOTS 里, isDetail 对它是 true。2026-09-20 account 从
                  DETAIL_ROOTS 移出后, 账户详情页恢复了跟其他一级页面一样的
                  三栏布局(自己的 board), 撤掉这个按钮的前提已经不成立 - 这里
                  是把它按原样放回来, 而不是发明一个新控件。
                  账户详情页曾经在这个 aside 顶部另开过一条本地收起/展开
                  (accountSidebarCollapsed) - 这个全局开关一恢复, "要不要看
                  这块地方"就只需要一个开关了, 那条本地状态在 2026-09-21
                  跟着它自己的功能条一起撤掉(owner: 聚焦客户全景图页面 -
                  这样更好一些, 现在可以去掉 sidebar 顶部的区域), 不是被
                  这次改动顺带清理的意外产物。 */}
              <ShellIconButton
                icon="sidebar"
                label={showBoard ? HEADER_TEXT.boardClose : HEADER_TEXT.boardOpen}
                onClick={toggleBoard}
              />

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

              {/* (3)-(6) THE DS'S 单产品视角 HEADER (design-system 13.4, 03 §7.1;
                  owner 2026-09-26: DS 已更新，header 需要适配): platform mark |
                  product title group | current domain. ShellProductTitle
                  carries the product mark, name, type and tier itself - the
                  hand-built lockup (a second logo inside ShellBrand's label, a
                  separate Tag for the tier) is gone. */}
              <ShellHeaderMark href="/" src={BRAND_MARK_SRC} alt={HEADER_TEXT.logoAlt} />
              <ShellHeaderDivider />
              <ShellProductTitle
                logoSrc={PRODUCT_MARK_SRC}
                name={SHELL_TEXT.brandMark}
                type={SHELL_TEXT.brandTagline}
                tier={
                  <span aria-label={HEADER_TEXT.subscriptionAria}>
                    {tier ? HEADER_TEXT.subscription(tier) : HEADER_TEXT.subscriptionNone}
                  </span>
                }
              />
              {/* THE CURRENT FUNCTIONAL DOMAIN (owner 2026-09-26: 当前功能域), once
                  in the header; home belongs to none, so it shows none. */}
              {domainLabel ? (
                <>
                  <ShellHeaderDivider />
                  <ShellHeaderDomain>{domainLabel}</ShellHeaderDomain>
                </>
              ) : null}

              {/* (7) Workspace and tenant - kept beyond the DS's product view
                  (owner 2026-09-26: 保留，放在当前域后面): data is isolated by
                  workspace, so which one you are reading has to be on screen
                  before any number is. */}
              <WorkspaceScope
                workspaceLabel={workspaceLabel}
                orgLabel={orgLabel}
                tierLabel={tier ? HEADER_TEXT.subscription(tier) : HEADER_TEXT.subscriptionNone}
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
            /* THE DS'S OWN trailing WRAPPER USES gap-2xs (4px) - fine for the
               icons INSIDE one control cluster (HeaderTools' own
               ShellIconGroup), too tight between three separate clusters
               (deck handle / tools / user menu), which is what read as
               crowded (owner, 2026-09-14). ShellHeader takes no prop for that
               gap, so this div is the one place it can be widened - it
               becomes the WRAPPER's only child, so the DS's own gap-2xs
               governs nothing once there is only one item to space. */
            <div className="flex items-center gap-lg">
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
                settingsHref={admin.some((e) => e.state === "visible") ? "/admin" : null}
              />

              {/* (4) The member, and their panel. */}
              {/* openLabel, or the trigger announces itself as "User menu" -
                  the DS's English fallback, and the one outlet the header audit
                  caught still defaulting. */}
              {/* THE DS'S COMPLETE PANEL, as its preview page draws it (owner,
                  2026-09-10: 按 DS 设计修正 header avatar 弹出的用户面板，有完整
                  组件面板): the header with the name, the account-status tag and
                  two meta lines (who the platform says you are; where you are),
                  the USER'S POINTS / LEVEL badges (the preview's Lv.4 - not
                  roles, and not the subscription tier either; both were the
                  owner's corrections), the account centre as a link, the
                  preferences, then the action pair 切换用户 above 退出登录, the
                  latter the one danger row.

                  The badge bar is EMPTY for now (owner, 2026-09-10: 先留空，等
                  平台提供). Points and level belong to the platform user
                  account, and nothing yucer holds carries them: the token
                  claims stop at sub / account_status, and the entitlement
                  contract is workspace tier and quota, not a person. An empty
                  array leaves no blank row (DS: badges 是空数组时不留空行).

                  displayName / uniqueLine (phone) / meta (org · workspace) /
                  avatarSrc all read from the access_token now (2026-09-16 rules
                  revision) - until then this panel showed the bare sub and a
                  static "unknown workspace" string, and the avatar comment
                  claimed the token "carries no picture claim" (it can, rarely -
                  only when the platform has a custom avatar on file). */}
              <ShellUserMenu
                openLabel={HEADER_TEXT.userMenuOpen}
                user={{
                  displayName: userName,
                  uniqueLine: userPhone ?? undefined,
                  meta: `${workspaceLabel} · ${orgLabel ?? HEADER_TEXT.tenantUnknown}`,
                  avatarSrc: userPicture ?? "/assets/icons/avatar-default.svg",
                  avatarAlt: userName,
                  statusTag: {
                    label: HEADER_TEXT.accountStatus(accountStatus),
                    verified: accountStatus === "active",
                  },
                  badges: [],
                }}
                links={
                  consoleUrl
                    ? [{ key: "console", label: HEADER_TEXT.accountCentre, href: consoleUrl, icon: "user-circle", newTab: true }]
                    : []
                }
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
            </div>
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
      {isAdmin ? (
        /* 配置管理'S OWN BODY: three zones, and only the middle one has
           anything in it today (owner, 2026-09-09).

           LEFT is the DS sidebar, which is not in here at all - it goes
           through ShellViewport's own slot, flush to the viewport edge.
           MIDDLE is the content. RIGHT is held for the agent and renders
           nothing yet; it is a named slot rather than a comment so that
           filling it later is one line and not a re-layout.

           THE MIDDLE'S SPACING IS TWO MEASUREMENTS, not one, and only one of
           them is ours. The INSET - the breathing room inside the content, and
           the safe area under it - is ShellPageContainer's, which is the DS
           component for exactly this: px/pt-page-inset (a clamp that tops out
           at 48px and moves continuously as the window is dragged, rather than
           stepping at a breakpoint), pb-6xl (80px) so the last row of a
           scrolled list does not sit on the fold, and a capped, centred measure
           so a 4K monitor does not hand a table 2,000px of line. Its own
           documentation gives the same reason the owner did: 用断点切档会在拖
           窗口时阵变一两次，正好最显眼.

           What is OURS is the MARGIN outside it: --vx-shell-gutter, the
           standoff between the three zones, fluid to 64px. It is a wrapper
           rather than a className on the container because the container's
           mx-auto is what centres it once the measure caps - merging a margin
           into that class would drop the centring.

           NO gap, NO p-lg on the row: every horizontal measurement in this
           plane is one of those two, so there is one place to change each. */
        <div id={SHELL_BODY_ID} className="flex h-full min-h-0">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="mx-(--vx-shell-gutter)">
              {/* wide-2xl NAMED RATHER THAN INHERITED: it is the DS's current
                  default, and this plane is tables - the tier the DS itself
                  labels 数据密集型面板 - so the choice should survive a change
                  of default. */}
              <ShellPageContainer width="wide-2xl">{children}</ShellPageContainer>
            </div>
          </div>
          {/* RIGHT - held for the agent. Deliberately empty: a zone reserved
              with a width would spend it on nothing, and this product has
              already removed three controls that did nothing. */}
        </div>
      ) : (
      <div
        id={SHELL_BODY_ID}
        // group/body + data-board: the account page renders its own board
        // pane (below) and hides it through this, since it cannot read the
        // toggle's client state itself.
        className="group/body flex h-full min-h-0 gap-xl p-lg"
        data-board={boardVisible ? "shown" : "hidden"}
      >
        {/* LEFT - ours. Cards that state where things stand; opening one
            navigates, but that is a consequence of the card, not its purpose.
            pb-2xl MIRRORS THE CENTRE'S OWN (owner, 2026-09-17 fix): this pane
            was scrolling with none, so its last card sat flush against the
            zone's bottom edge - reading as cut off rather than as the end of
            the list. The padding lives on this overflow-y-auto element, not
            on a wrapper around it, so it scrolls INTO view as trailing space
            rather than shrinking how far the pane can scroll. */}
        {isDossierPage ? (
          /* 客户 / 商机详情页: the page renders BOTH the board pane and the centre
             pane itself (lib/sidebar-slot.ts says why - a portal cannot run on
             the server, and the left pane went blank on every hard refresh). */
          children
        ) : (
        <>
        {boardVisible ? (
          <aside className={BOARD_PANE_CLASS}>
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
        <div className={CENTRE_PANE_CLASS}>
          {children}
        </div>
        </>
        )}

        {/* RIGHT - the agent, and what it is looking at. Same pb-2xl fix as
            the left flank - this pane scrolls independently too, so it needs
            its own copy of the safe area rather than inheriting the centre's. */}
        {deckVisible ? (
          <aside className="w-(--vx-pane-action) min-h-0 shrink-0 overflow-y-auto pb-2xl">
            {deck}
          </aside>
        ) : null}
      </div>
      )}
    </ShellViewport>
  );
}
