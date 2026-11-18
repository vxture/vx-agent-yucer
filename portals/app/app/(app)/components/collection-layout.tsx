"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import {
  Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon,
  type DrawerWidth, type FilterBarView, type IconName,
} from "@vxture/design-ui";
import { useLocale } from "../lib/i18n/provider";
import { FilterBar } from "./business-controls";

export const collectionDrawerWidth = {
  standard: "md",
  wide: "lg",
} as const satisfies Record<string, DrawerWidth>;

type CollectionToolbarProps = Pick<ComponentProps<typeof FilterBar>, "id" | "actions" | "children" | "onReset" | "search"> & {
  readonly title: string;
  readonly icon: IconName;
  readonly help?: ReactNode;
  readonly mode?: { readonly value: FilterBarView; readonly onChange: (value: FilterBarView) => void };
  readonly count?: number;
  readonly notice?: ReactNode;
};

export function CollectionToolbar({ title, icon, help, mode, count, notice, ...props }: CollectionToolbarProps) {
  return <FilterBar {...props} data-collection-toolbar
    heading={{ title, icon, help }} view={mode?.value} onViewChange={mode?.onChange} count={count} notice={notice} />;
}

// History is a compact table in both views. Entering list mode shows the
// entire collection; returning to cards starts with the disclosure closed.
export function CollectionHistory({ id, title, count, mode, revealMatches = false, children }: {
  readonly id?: string;
  readonly title: string;
  readonly count: number;
  readonly mode: FilterBarView;
  /** Keep a filter's results visible when none of the current records match. */
  readonly revealMatches?: boolean;
  readonly children: ReactNode;
}) {
  const locale = useLocale();
  if (!count) return null;
  const label = <>{title}<span className="tabular-nums">{count.toLocaleString(locale)}</span></>;
  return <section id={id} aria-label={title} data-collection-history>
    {mode === "list" ? <>
      <h3 className="mb-sm flex min-h-control-xl items-center gap-xs text-body-small text-muted-foreground">{label}</h3>
      {children}
    </> : <HistoryDisclosure key={String(revealMatches)} defaultOpen={revealMatches} label={label}>{children}</HistoryDisclosure>}
  </section>;
}

function HistoryDisclosure({ defaultOpen, label, children }: {
  readonly defaultOpen: boolean;
  readonly label: ReactNode;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <Collapsible open={open} onOpenChange={setOpen}>
    <h3><CollapsibleTrigger asChild><Button size="xl" variant="ghost" className="gap-xs text-body-small text-muted-foreground">
      <Icon name={open ? "chevron-up" : "chevron-down"} size="sm" aria-hidden="true" />{label}
    </Button></CollapsibleTrigger></h3>
    <CollapsibleContent className="pt-sm">{children}</CollapsibleContent>
  </Collapsible>;
}
