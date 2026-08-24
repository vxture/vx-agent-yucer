"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ShellBrand,
  ShellIconButton,
  ShellIconGroup,
  ShellSearchBox,
  ShellThemeToggle,
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import { ShellHeader, StatusBadge } from "@vxture/design-ui";
import { writeNavCollapsed } from "@vxture/shared";
import type { ResolvedNavEntry } from "../lib/navigation";
import { NavBoard } from "./nav-board";
import { AgentPanel } from "./agent-panel";
import { AgentDockButton } from "./agent-dock-button";
import type { AgentPanelData } from "../lib/board";
import type { BoardSection } from "../lib/board";
import { HEADER_TEXT, NAV_TEXT, SHELL_TEXT } from "../lib/messages";
import { BOARD_COOKIE_PREFIX, DOCK_COOKIE_PREFIX } from "../lib/shell-cookies";

/**
 * The three sections that stay open.
 *
 * They are what a person opens this product to do: what needs deciding today,
 * what is waiting on their signature, and what is still in play. Everything
 * else is a title until asked for - nine equally-loud panels teach a reader
 * nothing about which one matters.
 */
export const PINNED_SECTIONS = ["quota", "today", "adjudicate", "resource", "products", "allies"] as const;

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
  readonly onRecord?: (text: string) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Administration. Reached from a single header icon rather than a sidebar
   * group: it is not work and not data, it is setup - visited rarely, and a
   * permanent group for it spends sidebar height on something nobody opens on
   * a Monday. Absent entirely when the member holds no admin permission, so the
   * icon is not a locked door they cannot do anything about.
   */
  readonly admin: readonly ResolvedNavEntry[];
  readonly activeKey: string | null;
  readonly userName: string;
  readonly workspaceLabel: string;
  readonly upgradeHref: string;
  /** Build identity, so a bug report can say which build it was seen on. */
  readonly appVersion: string;
  /** The tier itself, not its display label - null when unsubscribed. */
  readonly tier: string | null;
  /** What search can reach. Assembled on the server so it obeys both gates. */
  readonly searchable: readonly { key: string; label: string; description?: string; href: string; group: "account" | "deal" }[];
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
  activeKey,
  userName,
  workspaceLabel,
  appVersion,
  tier,
  searchable,
  boardOpen,
  dockOpen,
  children,
}: AppShellProps) {
  const { mode, setMode } = useTheme();
  const [query, setQuery] = useState("");
  const router = useRouter();

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
  const hits = q === "" ? [] : searchable.filter((s) => s.label.toLowerCase().includes(q));
  const searchGroups = q === "" ? [] : [
    { key: "account", heading: HEADER_TEXT.groupAccounts, items: hits.filter((h) => h.group === "account") },
    { key: "deal", heading: HEADER_TEXT.groupDeals, items: hits.filter((h) => h.group === "deal") },
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
    <div className="bg-background min-h-screen">
      <ShellHeader
        leading={
          <>
            <ShellIconButton
              icon="sidebar"
              label={showBoard ? HEADER_TEXT.boardClose : HEADER_TEXT.boardOpen}
              active={showBoard}
              onClick={toggleBoard}
            />
            <ShellBrand href="/" label={SHELL_TEXT.brandName} tag={HEADER_TEXT.version(appVersion)} />
            {/* The workspace is the isolation key every row and every gate
                decision is scoped by. A member with access to more than one has
                to know which one they are reading before they read a single
                number - so it rides the header, where it is true of every page,
                rather than a panel that can be shut. */}
            <StatusBadge tone="neutral">{workspaceLabel}</StatusBadge>
            <StatusBadge tone={tier ? "brand" : "neutral"}>
              {tier ? HEADER_TEXT.subscription(tier) : HEADER_TEXT.subscriptionNone}
            </StatusBadge>
          </>
        }
        center={
          <ShellSearchBox
            query={query}
            onQueryChange={setQuery}
            groups={searchGroups}
            labels={{
              placeholder: HEADER_TEXT.searchPlaceholder,
              empty: HEADER_TEXT.searchEmpty,
              loading: HEADER_TEXT.searchLoading,
            }}
          />
        }
        trailing={
          <>
            <ShellIconGroup label={NAV_TEXT.ariaLabel}>
              {admin.some((e) => e.state === "visible") ? (
                <a href="/admin" aria-label={HEADER_TEXT.adminAria} title={HEADER_TEXT.adminAria}>
                  <ShellIconButton icon="settings" label={HEADER_TEXT.adminAria} />
                </a>
              ) : null}
              <ShellThemeToggle
                currentTheme={mode === "dark" ? "dark" : "light"}
                onThemeChange={(next) => setMode(next)}
              />
            </ShellIconGroup>

            {/* The agent deck's handle, and the only place the pending count is
                legible once the deck is shut. */}
            <AgentDockButton count={agent.pending.length} open={showDock} onToggle={toggleDock} />

            <ShellUserMenu user={{ displayName: userName, uniqueLine: workspaceLabel }} />
          </>
        }
      />

      {/* THE FRAME. Flex, not grid, and that is what removes the last naked CSS
          from the shell: the grid form of this needed an arbitrary column
          template carrying two literal pixel widths, hand-picked in an HTML mock
          rather than taken from anything. (Written out here it would still be
          scanned - Tailwind reads comments too - so it is described instead of
          quoted.) In flex the flanks can just BE `w-sidebar-expanded`,
          which is the DS's own sidebar width token, and the centre is whatever
          is left.

          The two spacings answer different questions and are deliberately far
          apart in size:

            p-md   - how close the console sits to the window. Small on purpose:
                     the flanks are instruments and they belong at the edges.
                     Not zero, because a panel flush against the viewport reads
                     as clipped rather than as placed.

                     md (16px), not sm. sm is the one fractional step in the
                     whole scale - 2.5 x the 4px base, so 10px - and a frame
                     inset is exactly the kind of structural measurement that
                     should land on a whole step. The sticky offsets follow it,
                     so a pinned flank stops level with the padding above it
                     rather than two pixels off.

            gap-page-inset - how far the centre's text stands off the flanks
                     beside it. This is the DS token whose stated job is the
                     breathing room around a content area, clamp(lg, 3.2vw, 3xl),
                     so 24px on a narrow window and 48px on a wide one, sliding
                     rather than stepping.

          I had these two the wrong way round: the page edge was pushed out to
          48px and the gutter left at 10px, which is the opposite of both. The
          gutter is the one doing the work here. */}
      <div className="flex flex-col flex-wrap gap-page-inset p-md lg:flex-row">
        {/* LEFT FLANK - ours. Cards that state where things stand; opening one
            navigates, but that is a consequence of the card, not its purpose. */}
        {showBoard ? (
          <aside className="flex w-full shrink-0 flex-col gap-page-inset lg:sticky lg:top-md lg:w-sidebar-expanded">
            <NavBoard sections={board} pinned={PINNED_SECTIONS} activeKey={activeKey} />
          </aside>
        ) : null}

        {/* CENTRE - the engagement */}
        <main className="min-w-0 flex-1">{children}</main>

        {/* RIGHT FLANK - the agent, and what it is looking at.

            col-span-full below 2xl is not cosmetic. The dock is the grid's third
            child, and below 2xl the template has only two columns - so it
            wrapped into column ONE, rendering the agent deck 288px wide and
            fifteen hundred pixels down the page, underneath the board. Spanning
            the row puts it below the content at full width instead, which is
            what "there is no room for a third column" should look like. */}
        {showDock ? (
          <aside className="flex w-full shrink-0 flex-col gap-page-inset 2xl:sticky 2xl:top-md 2xl:w-sidebar-expanded">
            <AgentPanel data={agent} canRecord={canRecord} onRecord={onRecord} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
