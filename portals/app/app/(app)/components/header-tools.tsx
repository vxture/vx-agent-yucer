"use client";

import Link from "next/link";

import { ShellHeaderTools } from "@vxture/design-system";
import { Badge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

/** The platform documentation site (owner decision, 2026-08-30). */
const HELP_URL = "https://docs.vxture.com";

/**
 * The shell body's id. It used to be what the header's fullscreen toggle
 * expanded; that tool is gone from the signed-in header (2026-09-26), and the
 * id stays because app-shell stamps it on the body it lays out.
 */
export const SHELL_BODY_ID = "yucer-shell-body";

// The signed-in shell's tools: help, messages, settings - THREE (owner,
// 2026-09-26: 登录状态 header 右侧操作组，保留帮助，消息，配置三项).
//
// Theme and language are not lost: both sit in the user panel's preferences
// (app-shell.tsx, ShellUserMenu), where a signed-in person sets them once.
// Fullscreen is dropped outright. The gate screens keep their visitor set
// (theme, language, fullscreen) - a visitor has no user panel to find them in.

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
   * Where help lives: the platform documentation site (owner decision,
   * 2026-08-30). A custom handler may still override it - the default opens
   * the docs in a new tab, noopener because the docs site needs no handle
   * back into a signed-in product.
   */
}

export function HeaderTools({
  notifications = 0,
  notificationItems = [],
  settingsHref,
}: HeaderToolsProps) {
  const { HEADER_TEXT } = useMessages();
  // THE DS'S STANDARD HEADER TOOLS (design-system 14, 03 section 7.1): the DS
  // owns the order and the interactions of its six slots; this product fills
  // three of them - help, messages (a side drawer), settings.
  return (
    <ShellHeaderTools
      /* NAMED OVERRIDE (owner allows local CSS where the DS stops, 2026-09-24;
         DS gap - see TD-037). The DS toolbox still draws 20px icons in 28px
         hit areas (its 13.3 spec) while every other header control is on the
         24px / 16px-icon ladder. Brought to the ladder: a 16px box plus its
         own 4px padding is 24px, and the icon is the 16px step. Remove when
         ShellToolbox follows the ladder. */
      className="[&_[data-slot^=shell-toolbox-]]:size-icon-sm [&_[data-slot^=shell-toolbox-]_svg]:size-icon-sm"
      label={HEADER_TEXT.toolsAria}
      linkComponent={Link}
      help={{ label: HEADER_TEXT.help, href: HELP_URL }}
      notifications={{
        label: notifications > 0 ? HEADER_TEXT.notificationsWithCount(notifications) : HEADER_TEXT.notifications,
        unread: notifications > 0,
        title: HEADER_TEXT.notifications,
        closeLabel: HEADER_TEXT.close,
        children:
          notificationItems.length === 0 ? (
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
          ),
      }}
      settings={settingsHref ? { label: HEADER_TEXT.settings, href: settingsHref } : undefined}
    />
  );
}
