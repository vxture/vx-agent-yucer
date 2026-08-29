"use client";

import Link from "next/link";

import {
  ShellFullscreenToggle,
  ShellIconButton,
  ShellIconGroup,
} from "@vxture/design-system";
import { Badge,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
  /**
   * Absent when the member holds no admin permission - a locked door they
   * cannot do anything about is not access control.
   *
   * A CALLBACK AND NOT AN HREF, which costs middle-click and is worth saying
   * out loud: ShellIconButton renders a <button> and takes no href or asChild,
   * so the only way to make it navigate is to wrap it in an anchor - and a
   * button inside a link is invalid markup that announces itself twice. It
   * measured as two identical "设置" controls at the same coordinate. Settings
   * is a rarely-visited destination, so losing middle-click is the cheaper
   * side of that trade; an href mode on ShellIconButton is a DS request.
   */
  readonly onSettings?: () => void;
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
  readonly onNotifications?: () => void;
}

export function HeaderTools({
  notifications = 0,
  notificationItems = [],
  onSettings,
  onHelp,
  onNotifications,
  fullscreenTarget,
}: HeaderToolsProps) {
  const { HEADER_TEXT } = useMessages();
  return (
    <ShellIconGroup label={HEADER_TEXT.toolsAria}>
      {/* The DS owns the fullscreen mechanics - the API, the escape key, the
          scroll lock - and takes both labels, so the state change is announced
          rather than left to the icon. */}
      <ShellFullscreenToggle
        targetId={SHELL_BODY_ID}
        getTargetElement={fullscreenTarget}
        enterLabel={HEADER_TEXT.fullscreen}
        exitLabel={HEADER_TEXT.fullscreenExit}
      />

      <ShellIconButton
        icon="help"
        label={HEADER_TEXT.help}
        onClick={onHelp ?? (() => window.open(HELP_URL, "_blank", "noopener"))}
      />

      <Popover>
        <PopoverTrigger asChild>
          <span className="relative inline-flex">
            <ShellIconButton
              icon="bell"
              label={
                notifications > 0
                  ? HEADER_TEXT.notificationsWithCount(notifications)
                  : HEADER_TEXT.notifications
              }
            />
            {notifications > 0 ? (
              // aria-hidden: the count is already in the button's accessible
              // name, and a screen reader should hear it once attached to its
              // control rather than twice as a loose number beside it. Same
              // construction and the same DS gap as the agent badge - TD-006.
              <span
                className="pointer-events-none absolute -top-2xs -right-2xs"
                aria-hidden="true"
              >
                <Badge variant="destructive">
                  {notifications > 99 ? HEADER_TEXT.countOverflow : notifications}
                </Badge>
              </span>
            ) : null}
          </span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-sm">
          {notificationItems.length === 0 ? (
            <p className="text-muted-foreground p-xs text-sm">
              {HEADER_TEXT.notificationsEmpty}
            </p>
          ) : (
            <div className="flex flex-col gap-2xs">
              {/* Each row is the queue, not an event: the count is live and the
                  link lands on the page that owns it. No read-state exists to
                  manage, so nothing here pretends to be dismissible. */}
              {notificationItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="hover:bg-accent flex items-center justify-between gap-sm rounded-sm p-xs text-sm"
                >
                  <span>
                    {HEADER_TEXT.notificationLabel[item.key] ?? item.key}
                  </span>
                  <Badge variant="destructive">{item.count}</Badge>
                </Link>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {onSettings ? (
        <ShellIconButton
          icon="settings"
          label={HEADER_TEXT.settings}
          onClick={onSettings}
        />
      ) : null}
    </ShellIconGroup>
  );
}
