"use client";

import type { ReactNode } from "react";
import { Card, ViewHeader } from "@vxture/design-ui";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";

// A module page's header: 4 + 1 (owner ruling 2026-10-02, 聚焦标题).
//
// FOUR THAT ARE ALWAYS THERE - the icon, the title, one short line of
// description, and the tags after the title (the key figures, in tone). ONE
// THAT IS THERE ON DEMAND - the action button, bottom-right, on the
// description's line (the DS ViewHeader's own self-end).
//
// NOTHING ELSE. No rule under it, no fold. What used to fold here was either a
// statistic - it moved to the page's own "xx分析" block - or a duplicate of one
// the page already had, and it is gone. A header that can open is a header
// that can hold anything, and it did.

export function ModuleHeadline({
  moduleKey,
  brief,
  description,
  tags,
  action,
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
}) {
  const { DOMAIN_LABEL, PAGE_BRIEF } = useMessages();
  // NAMED OVERRIDE (owner allows local CSS where the DS stops, 2026-09-24):
  // ViewHeader keeps its pb-lg with `divider={false}` - padding that holds the
  // rule off the text, left behind as blank card once the rule is gone. DS
  // gap: ViewHeader should drop the padding with the rule.
  return (
    <Card className="p-lg [&>section]:pb-0">
      <ViewHeader
        icon={moduleIcon(moduleKey)}
        title={DOMAIN_LABEL[moduleKey] ?? moduleKey}
        description={description ?? PAGE_BRIEF[brief ?? moduleKey] ?? ""}
        secondary={tags ? <span className="flex items-center gap-xs">{tags}</span> : undefined}
        divider={false}
        action={action}
      />
    </Card>
  );
}
