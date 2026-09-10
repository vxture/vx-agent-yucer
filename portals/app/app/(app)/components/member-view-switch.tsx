"use client";

import { Icon, ToggleGroup, ToggleGroupItem } from "@vxture/design-ui";

/* 清单 / 组织 switch - the DS's list/card switch with the tree icon (owner,
 * 2026-09-10: 这个滑动切换按钮有 DS 标准，需要更换 icon 即可。DS：list/card
 * 切换组件).
 *
 * THE DS'S `ViewModeSwitch` IS THIS, WITH ITS ICONS FIXED: list and
 * squares-four, no icon prop (its header says so - 图标固定、语义固定). The
 * second view here is the organisation TREE, and a grid-of-squares icon would
 * name the wrong thing, so this is the same composition the DS's own file
 * makes - a single-value ToggleGroup at the icon-md tier, `lg` icons, the
 * DS's own on-state classes, and the empty-value guard (Radix lets a single
 * group be un-picked; a view must always have one) - with `tree-structure`
 * in the second slot. Nothing restyled; every class is one the DS's switch
 * sets on itself. TD-026 asks the DS for an icon prop, and this file goes
 * the day it lands.
 */

export type MemberView = "list" | "org";

/* Verbatim the DS's ITEM classes for ViewModeSwitch (design-ui 9.1.0). */
const ITEM = [
  "text-muted-foreground",
  "data-[state=on]:bg-primary-muted",
  "data-[state=on]:text-primary-muted-foreground",
  "data-[state=on]:hover:bg-primary-muted-hover",
].join(" ");

export function MemberViewSwitch({ value, onChange, ariaLabel, labels }: {
  readonly value: MemberView;
  readonly onChange: (value: MemberView) => void;
  readonly ariaLabel: string;
  readonly labels: { readonly list: string; readonly org: string };
}) {
  return (
    <ToggleGroup
      type="single"
      size="icon-md"
      aria-label={ariaLabel}
      value={value}
      onValueChange={(next) => {
        if (next === "list" || next === "org") onChange(next);
      }}
    >
      {/* 组织 first and the default (owner, 2026-09-10: 把组织模式放在前，默认模式). */}
      <ToggleGroupItem value="org" aria-label={labels.org} title={labels.org} className={ITEM}>
        <Icon name="tree-structure" size="lg" />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label={labels.list} title={labels.list} className={ITEM}>
        <Icon name="list" size="lg" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
