"use client";

import type { ComponentProps } from "react";
import { FilterBar as DSFilterBar, TabsList as DSTabsList, ViewHeader as DSViewHeader, cn } from "@vxture/design-ui";
import styles from "./business-controls.module.css";

// TD-038: DS composite controls lack a shared size prop. Bind business rows
// to the DS 32px tier; compact actions use the native Button md (24px).
export function FilterBar({ className, ...props }: ComponentProps<typeof DSFilterBar>) {
  return <DSFilterBar {...props} className={cn(styles.toolbar, className)} />;
}

// 32px group with its 4px inset leaves a 24px interactive tab.
export function TabsList({ className, ...props }: ComponentProps<typeof DSTabsList>) {
  return <DSTabsList {...props} className={cn("h-control-xl", className)} />;
}

// Open page titles share the native DS divider, padding and 32px action row.
export function ViewHeader({ action, ...props }: ComponentProps<typeof DSViewHeader>) {
  return <DSViewHeader {...props} action={action ? <div className={styles.primary}>{action}</div> : undefined} />;
}
