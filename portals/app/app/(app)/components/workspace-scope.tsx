"use client";

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
      <ShellPanelContent align="start">
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
            <p className="text-muted-foreground px-md py-sm text-body-sm">
              {HEADER_TEXT.workspaceSwitchHint}
            </p>
          </ShellPanelSection>
      </ShellPanelContent>
    </Popover>
  );
}
