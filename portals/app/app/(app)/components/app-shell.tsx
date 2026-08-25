"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ShellBrand,
  ShellIconButton,
  ShellSearchBox,
  ShellUserMenu,
} from "@vxture/design-system";
import {
  Separator,
  ShellHeader,
  ShellViewport,
  StatusBadge,
} from "@vxture/design-ui";
import { writeNavCollapsed } from "@vxture/shared";
import type { ResolvedNavEntry } from "../lib/navigation";
import { NavBoard } from "./nav-board";
import { AgentPanel } from "./agent-panel";
import { AgentDockButton } from "./agent-dock-button";
import { HeaderTools, SHELL_BODY_ID } from "./header-tools";
import { WorkspaceScope } from "./workspace-scope";
import type { AgentPanelData } from "../lib/board";
import type { BoardSection } from "../lib/board";
import {
  DOMAIN_LABEL,
  HEADER_TEXT,
  NAV_TEXT,
  SHELL_TEXT,
} from "../lib/messages";
import { BOARD_COOKIE_PREFIX, DOCK_COOKIE_PREFIX } from "../lib/shell-cookies";

/**
 * The three sections that stay open.
 *
 * They are what a person opens this product to do: what needs deciding today,
 * what is waiting on their signature, and what is still in play. Everything
 * else is a title until asked for - nine equally-loud panels teach a reader
 * nothing about which one matters.
 */
export const PINNED_SECTIONS = [
  "quota",
  "queue",
  "resource",
  "products",
  "allies",
] as const;

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
  /** The agent's own reading, for the right flank. */
  readonly agent: AgentPanelData;
  readonly canRecord: boolean;
  readonly onRecord?: (
    text: string,
  ) => Promise<{ ok: boolean; error?: string }>;
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
  agent,
  canRecord,
  onRecord,
  admin,
  userName,
  workspaceLabel,
  appVersion,
  tier,
  tenantId,
  isProduction,
  searchable,
  boardOpen,
  dockOpen,
  children,
}: AppShellProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  // The first path segment IS the domain key: the routes are named for the
  // domains they serve, and DOMAIN_LABEL is keyed the same way. "/" is home.
  const pathname = usePathname();
  const activeKey =
    pathname === "/" ? "home" : (pathname.split("/")[1] ?? null);

  // Seeded from the server-read cookie, then owned by the client. The cookie is
  // written on each toggle rather than on unload, so the next full page load is
  // right even if this tab is killed.
  const [showBoard, setShowBoard] = useState(boardOpen);
  const [showDock, setShowDock] = useState(dockOpen);

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
      sidebarMode={showBoard ? "expanded" : "hidden"}
      header={
        <ShellHeader
          leading={
            <>
              {/* (1) The board toggle. */}
              <ShellIconButton
                icon="sidebar"
                label={
                  showBoard ? HEADER_TEXT.boardClose : HEADER_TEXT.boardOpen
                }
                onClick={toggleBoard}
              />

              {/* (2) The functional domain: NINE DOTS, no label, no fill.
                
                An app grid is a universal idiom and it does not need a word
                beside it; the 110px of text it used to carry made the second
                control in the header wider than the brand it sits before.
                The current domain is not lost - it moves to the accessible
                name, which is the only place it was ever load-bearing.

                STILL INERT until the domains are split. ShellIconButton with
                no onClick renders exactly that, and unlike a caret it makes no
                promise about what would open. */}
              <ShellIconButton
                icon="app-grid"
                label={
                  activeKey && DOMAIN_LABEL[activeKey]
                    ? HEADER_TEXT.scopeAria(DOMAIN_LABEL[activeKey])
                    : HEADER_TEXT.scopeAriaUnknown
                }
              />

              {/* (3)(4) Logo and product name. ShellBrand draws them as one
                lockup rather than as an image beside a word - the tag slot is
                the build label, which is part of the identity of what you are
                looking at, not a separate line of text. */}
              <ShellBrand
                href="/"
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
                count={agent.pending.length}
                open={showDock}
                onToggle={toggleDock}
              />

              {/* (3) The four shell tools. */}
              <HeaderTools
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
                user={{ displayName: userName, uniqueLine: workspaceLabel }}
              />
            </>
          }
        />
      }
      sidebar={
        /* LEFT FLANK - ours. Cards that state where things stand; opening one
           navigates, but that is a consequence of the card, not its purpose.
           Flush right: the cards end at the zone's right boundary. */
        <div className="min-h-0 flex-1 overflow-y-auto pt-lg pb-6xl pl-lg">
          <NavBoard
            sections={board}
            pinned={PINNED_SECTIONS}
            activeKey={activeKey}
          />
        </div>
      }
      dock={
        /* RIGHT FLANK - the agent, and what it is looking at. Flush left, for
           the same reason the board is flush right. */
        showDock ? (
          <aside className="w-sidebar-expanded shrink-0 overflow-y-auto pt-lg pr-lg pb-6xl">
            <AgentPanel
              data={agent}
              canRecord={canRecord}
              onRecord={onRecord}
            />
          </aside>
        ) : null
      }
    >
      {/* CENTRE - the engagement. Its horizontal padding IS the gutter on both
          sides, which is why the flanks carry none facing it.

          It also carries the fullscreen target id. Fullscreen here means the
          WORK gets all the glass, not the document: the header holds the way
          back out, so expanding over it would trap the reader in the thing
          they just expanded. */}
      <div id={SHELL_BODY_ID} className="px-page-inset pt-lg pb-6xl">
        {children}
      </div>
    </ShellViewport>
  );
}
