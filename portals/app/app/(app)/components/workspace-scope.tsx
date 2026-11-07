"use client";

import { HEADER_TEXT_CONTROL } from "./header-ladder";

import {
  ShellPanelContent,
  ShellPanelHeader,
  ShellPanelRow,
  ShellPanelSection,
  ShellScopeButton,
} from "@vxture/design-system";
import { Popover, PopoverTrigger } from "@vxture/design-ui";
import { useState } from "react";
import { useMessages } from "../lib/i18n/provider";

// Current scope comes from the token. Other memberships are managed in console.

export interface WorkspaceScopeProps {
  readonly workspaceLabel: string;
  /** The tenant's own display name (access_token's active_org_name, 2026-09-16
   *  rules revision) - a raw org id here was the same class of defect as the
   *  fallback workspace label: neither is a fact a reader can act on. */
  readonly orgLabel: string | null;
  /** The subscription tier's display label, or 未订阅. */
  readonly tierLabel: string;
  /** The platform console - where the tenant is managed. Null hides the row. */
  readonly consoleUrl: string | null;
}

export function WorkspaceScope({
  workspaceLabel,
  orgLabel,
  tierLabel,
  consoleUrl,
}: WorkspaceScopeProps) {
  const { HEADER_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  const tenantLabel = orgLabel ?? HEADER_TEXT.tenantUnknown;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ShellScopeButton
          className={HEADER_TEXT_CONTROL}
          icon="building"
          label={`${tenantLabel} · ${workspaceLabel}`}
          ariaLabel={`${HEADER_TEXT.workspaceAria}: ${tenantLabel} · ${workspaceLabel}`}
          active={open}
          caret
        />
      </PopoverTrigger>
      <ShellPanelContent align="start">
        <ShellPanelHeader
          lead="icon"
          icon="building"
          title={tenantLabel}
          metaRows={[{ key: "workspace", icon: "workspace", content: workspaceLabel }]}
        />
        {consoleUrl ? (
          <ShellPanelSection>
            <ShellPanelRow icon="settings" label={HEADER_TEXT.tenantConsole} href={consoleUrl} newTab chevron />
          </ShellPanelSection>
        ) : null}
      </ShellPanelContent>
    </Popover>
  );
}
