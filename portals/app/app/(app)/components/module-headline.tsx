"use client";

import { ViewHeader } from "./business-controls";

import type { ReactNode } from "react";

import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";

// A module page's header: 4 + 1 (owner ruling 2026-10-02, 聚焦标题).
//
// FOUR THAT ARE ALWAYS THERE - the icon, the title, one short line of
// description, and the tags after the title (the key figures, in tone). ONE
// THAT IS THERE ON DEMAND - the action button, bottom-right, on the
// description's line (the DS ViewHeader's own self-end).
//
// The DS divider and its bottom padding separate the open title from content.
// The page's ViewLayout supplies the space below the rule.

export function ModuleHeadline({
  moduleKey,
  brief,
  description,
  tags,
  action,
  className,
}: {
  /** The nav entry this page IS. Its icon and its NAME both come from the
   * registries - a page that spelled its own name drifted from the menu the
   * moment either was edited (owner, 2026-09-05: 价目与底价 in the page,
   * 产品定价 in the menu). */
  readonly moduleKey: string;
  /** Which PAGE_BRIEF line this page carries; the module key when omitted. */
  readonly brief?: string;
  /** Only where the line is not ours to write (the upgrade page's own pitch). */
  readonly description?: string;
  /** StatusBadges beside the title - the key figures, toned. */
  readonly tags?: ReactNode;
  /** The one button this page's header may carry. */
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  const { DOMAIN_LABEL, PAGE_BRIEF } = useMessages();
  return (
    <ViewHeader
      className={className}
      icon={moduleIcon(moduleKey)}
      title={DOMAIN_LABEL[moduleKey] ?? moduleKey}
      description={description ?? PAGE_BRIEF[brief ?? moduleKey] ?? ""}
      secondary={tags ? <span className="flex flex-wrap items-center gap-xs">{tags}</span> : undefined}
      divider
      action={action}
    />
  );
}
