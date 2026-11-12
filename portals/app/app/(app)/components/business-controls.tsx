"use client";

import type { ComponentProps } from "react";
import {
  ActionMenu as DSActionMenu,
  DataTable as DSDataTable,
  type DataTableProps,
  FilterBar as DSFilterBar,
  TabsList as DSTabsList,
  ViewHeader as DSViewHeader,
  cn,
} from "@vxture/design-ui";
import styles from "./business-controls.module.css";

// TD-038: DS composite controls lack a shared size prop. Bind business rows
// to the DS 32px tier; compact actions use the native Button md (24px).
export function FilterBar({
  className,
  ...props
}: ComponentProps<typeof DSFilterBar>) {
  return <DSFilterBar {...props} className={cn(styles.toolbar, className)} />;
}

// 32px group with its 4px inset leaves a 24px interactive tab.
export function TabsList({
  className,
  ...props
}: ComponentProps<typeof DSTabsList>) {
  return <DSTabsList {...props} className={cn("h-control-xl", className)} />;
}

// Open page titles share the native DS divider, padding and 32px action row.
export function ViewHeader({
  action,
  ...props
}: ComponentProps<typeof DSViewHeader>) {
  return (
    <DSViewHeader
      {...props}
      action={
        action ? <div className={styles.primary}>{action}</div> : undefined
      }
    />
  );
}

// TD-038: retain the DS menu, focus handling and destructive confirmations.
// Only its trigger dimensions are bound to the shared control/icon tokens.
export function ActionMenu(props: ComponentProps<typeof DSActionMenu>) {
  return (
    <span className={styles.overflow}>
      <DSActionMenu {...props} />
    </span>
  );
}

// TD-038: the DS hard-codes its index heading as "#" with no label slot.
// Preserve the native index/selection/expansion columns and their widths;
// only the index heading is visually empty. Direct-child selectors cannot
// affect a nested table rendered in an expanded row.
export function DataTable<Row>({ className, ...props }: DataTableProps<Row>) {
  const indexPosition =
    Number(props.selectedKeys !== undefined) +
    Number(
      props.expandedContent !== undefined &&
        props.onExpandedChange !== undefined,
    ) +
    Number(!!props.leadingSpacer);
  const indexClasses = [
    styles.indexFirst,
    styles.indexSecond,
    styles.indexThird,
    styles.indexFourth,
  ];
  return (
    <DSDataTable
      {...props}
      className={cn(
        props.indexStart !== undefined && indexClasses[indexPosition],
        className,
      )}
    />
  );
}
