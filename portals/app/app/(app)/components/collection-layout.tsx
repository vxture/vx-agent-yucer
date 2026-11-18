"use client";

import Link from "next/link";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon, ViewModeSwitch,
  type DrawerWidth, type FilterBarView, type IconName,
} from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { FilterBar } from "./business-controls";
import { SectionHeader } from "./help-section";
import { ModuleHeadline } from "./module-headline";

export const collectionDrawerWidth = {
  standard: "md",
  wide: "lg",
} as const satisfies Record<string, DrawerWidth>;

export function CollectionHeadline({ moduleKey, help, actions, create }: {
  readonly moduleKey: string;
  readonly help?: ReactNode;
  readonly actions?: ReactNode;
  readonly create?: { readonly href: string; readonly label: string };
}) {
  return <ModuleHeadline moduleKey={moduleKey} help={help} className="[&>div:last-child]:max-w-full"
    action={actions || create ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-sm" data-collection-global-actions>
      {actions}
      {create ? <Button asChild size="xl" className="px-md"><Link href={create.href}>
        <Icon name="plus" size="sm" aria-hidden="true" />{create.label}
      </Link></Button> : null}
    </div> : undefined} />;
}

type CollectionToolbarProps = Pick<ComponentProps<typeof FilterBar>, "id" | "actions" | "children" | "onReset" | "search"> & {
  readonly title: string;
  readonly icon: IconName;
  readonly help?: ReactNode;
  readonly mode?: { readonly value: FilterBarView; readonly onChange: (value: FilterBarView) => void };
  readonly count?: number;
  readonly notice?: ReactNode;
};

export function CollectionToolbar({ title, icon, help, mode, count, notice, ...props }: CollectionToolbarProps) {
  const { MARKET_STRATEGY_TEXT: T, TABLE_TOOLBAR_TEXT } = useMessages();
  const locale = useLocale();
  return <FilterBar {...props} resetLabel={TABLE_TOOLBAR_TEXT.resetFilters} data-collection-toolbar
    className="[&>div:first-child]:min-w-0 [&>div:first-child]:shrink [&>div:last-child]:ml-auto"
    scope={<div className="flex min-w-0 flex-wrap items-center gap-x-lg gap-y-sm">
      <SectionHeader level={2} icon={icon} title={title} help={help} divider={false} />
      <div className="flex flex-wrap items-center gap-sm">
        {mode ? <ViewModeSwitch value={mode.value} onChange={mode.onChange}
          ariaLabel={T.layout} labels={{ list: T.listView, cards: T.cardsView }} /> : null}
        {count !== undefined ? <span className="text-body-small tabular-nums text-muted-foreground" aria-live="polite">{count.toLocaleString(locale)}</span> : null}
        {notice}
      </div>
    </div>} />;
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
