"use client";

import { ViewHeader } from "./business-controls";
import type { PageHeaderActions } from "./page-header-actions";
import { NewEntryLink } from "./form-page";

import type { ReactNode } from "react";

import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";

// Module title, key figures and actions stay visible; guidance is on demand.
//
// The DS divider and its bottom padding separate the open title from content.
// The page's ViewLayout supplies the space below the rule.

export function ModuleHeadline({
  moduleKey,
  brief,
  description,
  help,
  tags,
  pageActions,
  create,
  className,
}: {
  /** The nav entry this page IS. Its icon and its NAME both come from the
   * registries - a page that spelled its own name drifted from the menu the
   * moment either was edited (owner, 2026-09-05: 价目与底价 in the page,
   * 产品定价 in the menu). */
  readonly moduleKey: string;
  /** Which PAGE_BRIEF appears in help; the module key when omitted. */
  readonly brief?: string;
  /** A current business summary, optionally with inline figures. Guidance stays in help. */
  readonly description?: ReactNode;
  readonly help?: ReactNode;
  /** StatusBadges beside the title - the key figures, toned. */
  readonly tags?: ReactNode;
  /** Page-wide controls. List filters and selection actions belong below. */
  readonly pageActions?: PageHeaderActions;
  readonly create?: { readonly href: string; readonly label?: string; readonly newTab?: boolean };
  readonly className?: string;
}) {
  const { DOMAIN_LABEL, PAGE_BRIEF } = useMessages();
  return (
    <ViewHeader
      className={className}
      icon={moduleIcon(moduleKey)}
      title={DOMAIN_LABEL[moduleKey] ?? moduleKey}
      description={description}
      help={help ?? (description === undefined ? PAGE_BRIEF[brief ?? moduleKey] : undefined)}
      secondary={tags ? <span className="flex flex-wrap items-center gap-xs">{tags}</span> : undefined}
      divider
      pageActions={create ? { ...pageActions, primary: <NewEntryLink {...create} /> } : pageActions}
    />
  );
}
