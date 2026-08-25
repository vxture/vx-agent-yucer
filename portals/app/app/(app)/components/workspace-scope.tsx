"use client";

import {
  ShellPanelContent,
  ShellPanelHeader,
  ShellPanelRow,
  ShellPanelSection,
  ShellScopeButton,
} from "@vxture/design-system";
import { Popover, PopoverContent, PopoverTrigger } from "@vxture/design-ui";
import { HEADER_TEXT } from "../lib/messages";

// The workspace and the tenant it belongs to.
//
// IT IS A PANEL, NOT A SWITCHER, and that is forced by the data rather than
// chosen. The token carries exactly one `activeWorkspace` and one `activeOrg`;
// both were decided upstream at sign-in, and this repo has no endpoint that
// could enumerate alternatives - the platform contract surface here is C1 (OIDC
// RP), C2 (entitlement) and C3 (provisioning), and none of them lists a
// member's workspaces. Drawing a caret over a list of one would promise a
// choice that does not exist, so the panel says where you are and how to
// change it instead.
//
// The caret stays, because the control DOES open something. What it opens is
// an explanation rather than a menu.
//
// Every string arrives from the caller. The DS's own fallbacks are English as
// of design-ui 5.0, and its changelog is explicit that a default appearing in a
// production interface means someone forgot to pass one - not a supported
// configuration. Passing them all is also what makes the locale switch a real
// switch rather than a half-translated page.

export interface WorkspaceScopeProps {
  readonly workspaceLabel: string;
  readonly tenantId: string | null;
}

export function WorkspaceScope({
  workspaceLabel,
  tenantId,
}: WorkspaceScopeProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span>
          <ShellScopeButton
            icon="building-library"
            label={workspaceLabel}
            ariaLabel={HEADER_TEXT.workspaceAria}
            caret
          />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-none">
        <ShellPanelContent>
          <ShellPanelHeader icon="building-library" title={workspaceLabel} />
          <ShellPanelSection divided={false}>
            <ShellPanelRow
              label={HEADER_TEXT.workspaceLabel}
              value={workspaceLabel}
            />
            <ShellPanelRow
              label={HEADER_TEXT.tenantLabel}
              value={tenantId ?? HEADER_TEXT.tenantUnknown}
            />
          </ShellPanelSection>
          <ShellPanelSection>
            {/* Said plainly rather than offered as a control that does
                nothing. A greyed-out switcher would be worse: it implies the
                capability exists and is merely unavailable to you. */}
            <p className="text-muted-foreground px-md py-sm text-xs">
              {HEADER_TEXT.workspaceSwitchHint}
            </p>
          </ShellPanelSection>
        </ShellPanelContent>
      </PopoverContent>
    </Popover>
  );
}
