"use client";

import Link from "next/link";

import { ShellToolbox, ShellToolboxButton } from "@vxture/design-system";
import {
  Badge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  useFullscreen,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

/**
 * The id the fullscreen toggle expands.
 *
 * The SHELL BODY, not the document: fullscreen here means "give the work all
 * the glass", and the header is the one thing you still need while doing it -
 * it holds the way back out. Exported so the shell can stamp the same id on
 * the element this points at; two literals would drift apart silently and the
 * failure mode is a button that does nothing.
 */
/** The platform documentation site - see the onHelp prop note. */
const HELP_URL = "https://docs.vxture.com";

export const SHELL_BODY_ID = "yucer-shell-body";

// The four shell tools, in one group.
//
// GROUPED BECAUSE THEY ARE ONE KIND OF THING: each acts on the shell rather
// than on the data underneath it. A reader who has found the fullscreen button
// has found help, notifications and settings, which is the whole argument for
// putting them in a row instead of scattering them by importance.
//
// Order is fixed and deliberate: fullscreen changes what you can see, help
// explains it, notifications interrupt it, settings change it for good. It runs
// from the most local effect to the most lasting one.

export interface HeaderToolsProps {
  /** Unread notifications. Zero draws no badge rather than a "0". */
  readonly notifications?: number;
  /** The queues behind the number. See lib/notifications.ts for what counts. */
  readonly notificationItems?: readonly {
    readonly key: string;
    readonly count: number;
    readonly href: string;
  }[];
  /** Where administration lives; absent when the member holds no admin
   *  permission - a locked door they cannot open is not access control. */
  readonly settingsHref?: string | null;
  /**
   * What fullscreen expands. Defaults to the shell body by id; the shell hands
   * down the document element, because "fullscreen" that leaves a header on
   * screen is not the thing the button is named after - and the browser's own
   * escape key, which the DS wires, is the way back out.
   */
  readonly fullscreenTarget?: () => HTMLElement | null;
  /**
   * Where help lives: the platform documentation site (owner decision,
   * 2026-08-30). A custom handler may still override it - the default opens
   * the docs in a new tab, noopener because the docs site needs no handle
   * back into a signed-in product.
   */
  readonly onHelp?: () => void;
}

export function HeaderTools({
  notifications = 0,
  notificationItems = [],
  settingsHref,
  onHelp,
  fullscreenTarget,
}: HeaderToolsProps) {
  const { HEADER_TEXT } = useMessages();
  const fullscreen = useFullscreen();
  const fullscreenOn = fullscreen.isFullscreen && fullscreen.targetId === SHELL_BODY_ID;
  // THE DS'S TOOLBOX (design-system 13.3, owner 2026-09-26: header 已更新): one
  // pale capsule, 20px icons, the hover and open states the DS owns. Help and
  // settings are LINKS now - the toolbox takes an href, which the old icon
  // button did not (the reason settings used to be a callback that lost
  // middle-click). Notifications and fullscreen are composed buttons: one
  // opens a popover, the other toggles state.
  return (
    <ShellToolbox
      label={HEADER_TEXT.toolsAria}
      linkComponent={Link}
      items={[
        onHelp
          ? { key: "help", icon: "help", label: HEADER_TEXT.help, onClick: onHelp }
          : { key: "help", icon: "help", label: HEADER_TEXT.help, href: HELP_URL, newTab: true },
        { key: "settings", icon: "settings", label: HEADER_TEXT.settings, href: settingsHref ?? undefined, hidden: !settingsHref },
      ]}
    >
      <ShellToolboxButton
        icon="corners-out"
        label={fullscreenOn ? HEADER_TEXT.fullscreenExit : HEADER_TEXT.fullscreen}
        active={fullscreenOn}
        onClick={() => {
          const el = fullscreenTarget?.() ?? document.getElementById(SHELL_BODY_ID);
          if (el) fullscreen.toggle(SHELL_BODY_ID, el);
        }}
      />
      <Popover>
        <PopoverTrigger asChild>
          <ShellToolboxButton
            icon="bell"
            badge={notifications > 0}
            label={notifications > 0 ? HEADER_TEXT.notificationsWithCount(notifications) : HEADER_TEXT.notifications}
          />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-sm">
          {notificationItems.length === 0 ? (
            <p className="text-muted-foreground p-xs text-sm">{HEADER_TEXT.notificationsEmpty}</p>
          ) : (
            <div className="flex flex-col gap-2xs">
              {/* Each row is the queue, not an event: the count is live and the
                  link lands on the page that owns it. */}
              {notificationItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="hover:bg-accent flex items-center justify-between gap-sm rounded-sm p-xs text-sm"
                >
                  <span>{HEADER_TEXT.notificationLabel[item.key] ?? item.key}</span>
                  <Badge variant="destructive">{item.count}</Badge>
                </Link>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </ShellToolbox>
  );
}
