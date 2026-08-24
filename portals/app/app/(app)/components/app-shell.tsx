"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShellBrand,
  ShellIconButton,
  ShellIconGroup,
  ShellScopeButton,
  ShellSearchBox,
  ShellThemeToggle,
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import { Card, StatusBadge } from "@vxture/design-ui";
import type { ResolvedNavEntry } from "../lib/navigation";
import { NavBoard } from "./nav-board";
import { AgentPanel } from "./agent-panel";
import type { AgentPanelData } from "../lib/board";
import type { BoardSection } from "../lib/board";

/**
 * The three sections that stay open.
 *
 * They are what a person opens this product to do: what needs deciding today,
 * what is waiting on their signature, and what is still in play. Everything
 * else is a title until asked for - nine equally-loud panels teach a reader
 * nothing about which one matters.
 */
export const PINNED_SECTIONS = ["quota", "today", "adjudicate", "resource", "products", "allies"] as const;
import { DOMAIN_LABEL, HEADER_TEXT, NAV_TEXT, SHELL_TEXT } from "../lib/messages";

// yucer's application shell.
//
// The CHROME is the design system's - .app / .vxh / .sidebar / .nav-* /
// .content-* come from shell-template.css, which the console and admin portals
// also consume so the three surfaces stay visually identical. Nothing here
// restyles them.
//
// The SHELL is yucer's, and it encodes one business decision the previous flat
// nine-item list actively obscured:
//
//   D1..D7 are a CHAIN. Strategy leads to a campaign, which produces a signal,
//   which becomes a lead, a deal, a project, and finally cash. Their order in
//   the sidebar is that sequence, not an alphabet - a salesperson reading it
//   top to bottom is reading the product's thesis.
//
//   D8, the copilot, is NOT the eighth step. It cuts across all seven, so
//   listing it as their peer would suggest a stage that comes after delivery.
//   It gets its own group.
//
//   Administration sits outside the chain entirely.
//
// The two gate states render differently, and that asymmetry is deliberate:
// an ENTITLEMENT gap is advertised with the tier that would unlock it, because
// a feature nobody can see is a feature nobody buys. A PERMISSION gap is
// silent - resolveNavigation drops those entries before they reach here, so
// nobody is teased with a door only their colleague can open.

export interface AppShellProps {
  /** Where a person acts: the judgement stream and the decision queue. */
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
  upgradeHref,
  appVersion,
  tier,
  searchable,
  children,
}: AppShellProps) {
  const { mode, setMode } = useTheme();
  const [query, setQuery] = useState("");
  const router = useRouter();

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
      {/* The template's own three-column grid, used as it was designed:
          minmax(0,1fr) | minmax(240px,460px) | auto - identity, search,
          actions. The 1fr on the first column IS the gap; nothing needs to be
          pushed anywhere.
          
          What was wrong before was not .vxh-left (which the stylesheet does
          define: inline-flex, gap 12px, min-width 0) but that there were only
          three children and none of them was a search box - so the workspace
          badge landed in the search column and the actions in the third, and
          the header looked like a header with a stray badge in the middle. */}
      {/* THREE ZONES, and the header is split between the two flanks.
          A full-width bar across the top said "this is a document with a
          toolbar". The product is a console: your own standing on the left,
          the engagement in the middle, the agent and the enemy on the right -
          so identity rides the own-forces panel and the tools ride the
          agent's, because that is whose they are. */}
      <div className="grid items-start gap-sm p-sm lg:grid-cols-[288px_minmax(0,1fr)] 2xl:grid-cols-[288px_minmax(0,1fr)_320px]">
        {/* LEFT FLANK - ours */}
        <div className="hidden flex-col gap-sm lg:sticky lg:top-sm lg:flex">
          <Card className="p-sm">
            <div className="flex items-center gap-xs">
              <ShellBrand href="/" label={SHELL_TEXT.brandName} tag={HEADER_TEXT.version(appVersion)} />
            </div>
            <div className="mt-xs flex flex-wrap items-center gap-2xs">
              <StatusBadge tone="neutral">{workspaceLabel}</StatusBadge>
              <StatusBadge tone={tier ? "brand" : "neutral"}>
                {tier ? HEADER_TEXT.subscription(tier) : HEADER_TEXT.subscriptionNone}
              </StatusBadge>
            </div>
          </Card>

          <NavBoard sections={board} pinned={PINNED_SECTIONS} activeKey={activeKey} />
        </div>

        {/* CENTRE - the engagement */}
        <main className="min-w-0">{children}</main>

        {/* RIGHT FLANK - the agent, and what it is looking at */}
        <div className="hidden flex-col gap-sm 2xl:sticky 2xl:top-sm 2xl:flex">
          <Card className="p-sm">
            <div className="flex items-center gap-xs">
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
              <ShellUserMenu user={{ displayName: userName, uniqueLine: workspaceLabel }} />
            </div>
          </Card>

          <AgentPanel data={agent} canRecord={canRecord} onRecord={onRecord} />
        </div>
      </div>
    </div>
  );
}
