"use client";

import {
  ShellPanelContent,
  ShellPanelRow,
  ShellPanelSection,
  ShellScopeButton,
} from "@vxture/design-system";
import { Popover, PopoverTrigger } from "@vxture/design-ui";
import { useState } from "react";
import { useMessages } from "../lib/i18n/provider";

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
  const { HEADER_TEXT } = useMessages();
  /* THE DS'S STRUCTURE (design-system 12.x, owner 2026-09-10: hover 放宽，
     内部没有适配). ShellScopeButton widens to the panel's width on hover AND
     while open, and it takes `active` for the open half - so it has to BE
     the trigger (it forwards its ref) and be told when the panel is open.
     The old shape wrapped it in a span and never passed `active`: the hover
     widened, the click did not, and the button snapped back to 192px the
     moment the pointer left, with the 320px panel hanging off a narrow
     control. ShellPanelContent IS the DS's PopoverContent, so it is the
     content directly; a PopoverContent around it was a popover in a popover. */
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ShellScopeButton
          icon="building-library"
          label={workspaceLabel}
          ariaLabel={HEADER_TEXT.workspaceAria}
          active={open}
          caret
        />
      </PopoverTrigger>
      {/* SIMPLIFIED (owner, 2026-09-14): just the two facts, nothing else -
          no repeated title bar, no switch-hint copy. Tenant first, then
          workspace, matching how the two are named when this is described. */}
      <ShellPanelContent align="start">
          <ShellPanelSection divided={false}>
            <ShellPanelRow
              label={HEADER_TEXT.tenantLabel}
              value={tenantId ?? HEADER_TEXT.tenantUnknown}
            />
            <ShellPanelRow
              label={HEADER_TEXT.workspaceLabel}
              value={workspaceLabel}
            />
          </ShellPanelSection>
      </ShellPanelContent>
    </Popover>
  );
}
