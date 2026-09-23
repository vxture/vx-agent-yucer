"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@vxture/design-ui";

// 集团合并视图 (YC-021 L1): a parent company's badge row, either for this
// unit alone or for the group - itself plus every unit below it. Both rows
// are built on the server; this only chooses which one shows. The default is
// the unit alone, because that is what every other figure on the page means.
//
// The two rows arrive as slot props and are each wrapped in their own keyed
// Fragment - a server-built node beside a sibling otherwise trips React's
// "unique key" warning (see memory: RSC slot props are lazy).
export function GroupScopeSwitch({
  single,
  group,
  labels,
}: {
  readonly single: ReactNode;
  readonly group: ReactNode;
  readonly labels: { readonly aria: string; readonly single: string; readonly group: string };
}) {
  const [scope, setScope] = useState<"single" | "group">("single");
  return (
    <div className="flex flex-col items-center gap-sm">
      <ToggleGroup
        type="single"
        size="sm"
        aria-label={labels.aria}
        value={scope}
        onValueChange={(next) => {
          if (next === "single" || next === "group") setScope(next);
        }}
      >
        <ToggleGroupItem value="single">{labels.single}</ToggleGroupItem>
        <ToggleGroupItem value="group">{labels.group}</ToggleGroupItem>
      </ToggleGroup>
      {scope === "single" ? <Fragment key="single">{single}</Fragment> : <Fragment key="group">{group}</Fragment>}
    </div>
  );
}
