"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Icon,
  ShellBrand,
  ShellThemeToggle,
  ShellUserMenu,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useTheme,
} from "@vxture/design-system";
import type { ResolvedNavEntry } from "../lib/navigation";
import { DOMAIN_LABEL, NAV_TEXT, SHELL_TEXT } from "../lib/messages";

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
  readonly domains: readonly ResolvedNavEntry[];
  readonly admin: readonly ResolvedNavEntry[];
  readonly copilot: ResolvedNavEntry | null;
  readonly activeKey: string | null;
  readonly userName: string;
  readonly workspaceLabel: string;
  readonly upgradeHref: string;
  readonly children: ReactNode;
}

function NavLink({ entry, active }: { entry: ResolvedNavEntry; active: boolean }) {
  const label = DOMAIN_LABEL[entry.key] ?? entry.key;

  if (entry.state === "locked") {
    // Shown, not hidden, and it says what would unlock it.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="nav-item" aria-disabled="true" data-locked="true">
            <i aria-hidden="true">
              <Icon name={entry.icon} />
            </i>
            <span className="nav-item-label">{label}</span>
            <StatusBadge tone="neutral">
              {entry.decision.requiredTier
                ? NAV_TEXT.requiresTier(entry.decision.requiredTier)
                : NAV_TEXT.notSubscribed}
            </StatusBadge>
          </span>
        </TooltipTrigger>
        <TooltipContent>{NAV_TEXT.upgradeCta}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={entry.href}
      className={active ? "nav-item active" : "nav-item"}
      aria-current={active ? "page" : undefined}
    >
      <i aria-hidden="true">
        <Icon name={entry.icon} />
      </i>
      <span className="nav-item-label">{label}</span>
    </Link>
  );
}

function NavSection({
  title,
  entries,
  activeKey,
}: {
  title: string;
  entries: readonly ResolvedNavEntry[];
  activeKey: string | null;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="nav-section">
      <div className="nav-section-title">{title}</div>
      <div className="nav-items">
        {entries.map((e) => (
          <NavLink key={e.key} entry={e} active={e.key === activeKey} />
        ))}
      </div>
    </div>
  );
}

export function AppShell({
  domains,
  admin,
  copilot,
  activeKey,
  userName,
  workspaceLabel,
  upgradeHref,
  children,
}: AppShellProps) {
  const { mode, setMode } = useTheme();

  return (
    <div className="app">
      <header className="vxh">
        <div className="vxh-left">
          <ShellBrand href="/" label={SHELL_TEXT.brandName} />
        </div>

        {/* The workspace is the isolation key every row and every gate decision
            is scoped by. Showing it is not decoration - a member with access to
            more than one needs to know which one they are looking at before
            they read a single number. */}
        <div className="vxh-context">
          <StatusBadge tone="neutral">{workspaceLabel}</StatusBadge>
        </div>

        <div className="vxh-actions">
          <ShellThemeToggle
            currentTheme={mode === "dark" ? "dark" : "light"}
            onThemeChange={(next) => setMode(next)}
          />
          <ShellUserMenu user={{ displayName: userName, uniqueLine: workspaceLabel }} />
        </div>
      </header>

      <div className="app-body">
        <nav className="sidebar" aria-label={NAV_TEXT.ariaLabel}>
          <NavSection title={NAV_TEXT.groupChain} entries={domains} activeKey={activeKey} />
          {copilot ? (
            <NavSection title={NAV_TEXT.groupAgent} entries={[copilot]} activeKey={activeKey} />
          ) : null}
          <NavSection title={NAV_TEXT.groupAdmin} entries={admin} activeKey={activeKey} />

          {/* The conversion exit stays reachable from the shell rather than only
              from a domain that happens to be locked. */}
          {domains.some((d) => d.state === "locked") ? (
            <div className="side-foot">
              <a className="nav-item" href={upgradeHref}>
                <i aria-hidden="true">
                  <Icon name="sparkles" />
                </i>
                <span className="nav-item-label">{NAV_TEXT.upgradeCta}</span>
              </a>
            </div>
          ) : null}
        </nav>

        <main className="content-scroll">
          <div className="content-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
