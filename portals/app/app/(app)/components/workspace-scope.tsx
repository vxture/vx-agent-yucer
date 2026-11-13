"use client";

import { HEADER_SCOPE_CONTROL } from "./header-ladder";
import tenantDefaultLogo from "@vxture/design-system/assets/icons/tenant-default.png";

import {
  ShellPanelContent,
  ShellPanelHeader,
  ShellPanelRow,
  ShellPanelSection,
  ShellScopeButton,
} from "@vxture/design-system";
import { Icon, Popover, PopoverTrigger, StatusBadge } from "@vxture/design-ui";
import { useState } from "react";
import { useMessages } from "../lib/i18n/provider";
import { organizationLabels } from "../lib/organization-labels";

// Current scope comes from the token. Other memberships are managed in console.

export interface WorkspaceScopeProps {
  readonly workspaceLabel: string;
  /** The tenant's own display name (access_token's active_org_name, 2026-09-16
   *  rules revision) - a raw org id here was the same class of defect as the
   *  fallback workspace label: neither is a fact a reader can act on. */
  readonly orgLabel: string | null;
  readonly orgDisplayName: string | null;
  readonly orgLogoUrl: string | null;
  /** The platform console - where the tenant is managed. Null hides the row. */
  readonly consoleUrl: string | null;
  readonly activeOrgType: string | null;
}

export function WorkspaceScope({
  workspaceLabel,
  orgLabel,
  orgDisplayName,
  orgLogoUrl,
  consoleUrl,
  activeOrgType,
}: WorkspaceScopeProps) {
  const { HEADER_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  const scopeType = activeOrgType?.toLowerCase();
  const typeLabel = scopeType === "personal" ? HEADER_TEXT.personalScope
    : scopeType === "organization" || scopeType === "team" ? HEADER_TEXT.organizationScope : null;
  const labels = organizationLabels(orgLabel, orgDisplayName, HEADER_TEXT.tenantUnknown);
  // Platform TenantAvatar policy: default DS image, then the type icon if it fails.
  const tenantIcon = scopeType === "personal" ? "building-office" : "buildings";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ShellScopeButton
          className={HEADER_SCOPE_CONTROL}
          icon="buildings"
          label={(
            <span className="flex items-center gap-2xs whitespace-nowrap">
              <span className="text-label-small text-foreground">{labels.trigger}</span>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <span className="text-label-small text-muted-foreground">{workspaceLabel}</span>
            </span>
          )}
          ariaLabel={`${HEADER_TEXT.workspaceAria}: ${labels.trigger} · ${workspaceLabel}`}
          active={open}
          caret
        />
      </PopoverTrigger>
      <ShellPanelContent align="start" className="gap-lg">
        <ShellPanelHeader
          lead="avatar"
          avatarSrc={orgLogoUrl || tenantDefaultLogo.src}
          avatarAlt={labels.panel}
          avatarFallback={<Icon name={tenantIcon} size="sm" />}
          className="[&>span]:rounded-md [&>span>span]:rounded-md"
          title={labels.panel}
          titleAside={typeLabel ? <StatusBadge size="xs" tone="neutral" icon={false}>{typeLabel}</StatusBadge> : undefined}
          metaRows={[{ key: "workspace", icon: "workspace", content: workspaceLabel }]}
        />
        <ShellPanelSection className="gap-md">
          <ShellPanelRow
            icon="squares-four"
            label={HEADER_TEXT.applicationCentre}
            description={HEADER_TEXT.applicationCentreDescription}
            href="https://ruyin.work"
            newTab
            trailingIcon="external-link"
          />
          {consoleUrl ? (
            <ShellPanelRow
              icon="buildings"
              label={HEADER_TEXT.tenantConsole}
              description={HEADER_TEXT.organizationInfoDescription}
              href={consoleUrl}
              newTab
              trailingIcon="external-link"
            />
          ) : null}
        </ShellPanelSection>
      </ShellPanelContent>
    </Popover>
  );
}
