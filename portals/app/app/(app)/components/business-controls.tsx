"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  ActionMenu as DSActionMenu,
  Checkbox,
  DataTable as DSDataTable,
  type DataTableColumn,
  type DataTableProps,
  FilterBar as DSFilterBar,
  TabsList as DSTabsList,
  ViewHeader as DSViewHeader,
  ViewModeSwitch,
  type IconName,
  cn,
} from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { SectionHeader } from "./help-section";
import { TitleHelp } from "./title-help";
import styles from "./business-controls.module.css";

// TD-038: DS composite controls lack a shared size prop. Bind business rows
// to the DS 32px tier; explicit data-control-size="compact" selects 24px.
export function FilterBar({
  className,
  heading,
  view,
  onViewChange,
  cardsDisabledReason,
  count,
  scope,
  notice,
  resetLabel,
  ...props
}: ComponentProps<typeof DSFilterBar> & {
  readonly notice?: ReactNode;
  readonly heading?: { readonly title: string; readonly icon?: IconName; readonly help?: ReactNode };
}) {
  const { MARKET_STRATEGY_TEXT: T, TABLE_TOOLBAR_TEXT } = useMessages();
  const locale = useLocale();
  const mode = view && onViewChange ? (
    <ViewModeSwitch value={view} onChange={onViewChange} cardsDisabledReason={cardsDisabledReason}
      ariaLabel={T.layout} labels={{ list: T.listView, cards: T.cardsView }} />
  ) : null;
  return (
    <DSFilterBar {...props} className={cn(styles.toolbar, className)}
      resetLabel={resetLabel ?? TABLE_TOOLBAR_TEXT.resetFilters}
      scope={heading || mode || count !== undefined || scope || notice ? (
        <div className={styles.toolbarHeading} data-business-list-heading={heading ? "" : undefined}>
          {heading ? <SectionHeader level={2} {...heading} divider={false} /> : null}
          {mode}
          {scope}
          {count !== undefined ? <span className="text-body-small tabular-nums text-muted-foreground" aria-live="polite">
            {typeof count === "number" ? count.toLocaleString(locale) : count}
          </span> : null}
          {notice}
        </div>
      ) : undefined}
    />
  );
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
  className,
  help,
  secondary,
  ...props
}: ComponentProps<typeof DSViewHeader> & { readonly help?: ReactNode }) {
  return (
    <DSViewHeader
      {...props}
      className={cn(styles.pageHeader, className)}
      secondary={help ? <>
        <TitleHelp topic={typeof props.title === "string" ? props.title : undefined}>{help}</TitleHelp>
        {secondary}
      </> : secondary}
      action={
        action ? <div className={styles.primary} data-business-page-actions>{action}</div> : undefined
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
export type BusinessDataTableProps<Row> = DataTableProps<Row> & {
  /** Merge the index and checkbox tracks when the list has an actual selection action. */
  readonly compactSelection?: { readonly label: (row: Row) => string; readonly alwaysVisible?: boolean };
};

export function DataTable<Row>({ className, compactSelection, ...props }: BusinessDataTableProps<Row>) {
  if (compactSelection && !props.expandedContent && !props.leadingSpacer && props.indexStart !== undefined &&
    props.selectedKeys !== undefined && props.onSelectionChange) {
    return <CompactDataTable {...props} className={className} selection={compactSelection} />;
  }
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

function CompactDataTable<Row>({
  columns, rows, rowKey, className, indexStart = 1, selectedKeys = [], onSelectionChange,
  isRowSelectable, labels, selection, ...props
}: DataTableProps<Row> & { readonly selection: NonNullable<BusinessDataTableProps<Row>["compactSelection"]> }) {
  const { DATA_TABLE_LABELS } = useMessages();
  const selected = new Set(selectedKeys);
  const selectableKeys = rows.flatMap((row, i) => (isRowSelectable?.(row, i) ?? true) ? [rowKey(row, i)] : []);
  const allSelected = selectableKeys.length > 0 && selectableKeys.every(key => selected.has(key));
  const someSelected = selectableKeys.some(key => selected.has(key));
  const visible = selected.size > 0 || selection.alwaysVisible;
  function update(keys: readonly string[], checked: boolean) {
    const next = new Set(selected);
    for (const key of keys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    onSelectionChange?.([...next]);
  }

  const leading: DataTableColumn<Row> = {
    id: "business-selection-index",
    align: "center",
    header: <span data-compact-index>
      {selectableKeys.length > 0 && !props.loading ? <Checkbox className={styles.compactCheck}
        aria-label={allSelected ? labels?.deselectAll ?? DATA_TABLE_LABELS.deselectAll : labels?.selectAll ?? DATA_TABLE_LABELS.selectAll}
        checked={allSelected || (someSelected && "indeterminate")} onCheckedChange={() => update(selectableKeys, !allSelected)} /> : null}
    </span>,
    cell: (row, i) => {
      const key = rowKey(row, i);
      const checked = selected.has(key);
      return <span data-compact-index className={styles.compactToggle}>
        <span className={styles.compactNumber}>{indexStart + i}</span>
        {isRowSelectable?.(row, i) === false ? null : (
          <Checkbox className={styles.compactCheck} checked={checked}
            aria-label={selection.label(row)} onCheckedChange={() => update([key], !checked)} />
        )}
      </span>;
    },
  };
  return <div className={styles.compactSelection} data-show-selection={visible ? "" : undefined}
    ref={root => {
      if (!root) return;
      const onClick = (event: MouseEvent) => {
        const target = event.target;
        if (event.defaultPrevented || !(target instanceof Element) ||
          target.closest("a, button, input, label, select, textarea, summary, [role=button], [role=link], [role=menuitem], [aria-haspopup], [contenteditable]") ||
          window.getSelection()?.toString()) return;
        const row = target.closest("tbody > tr");
        const table = root.querySelector(":scope > div > div > table");
        if (row?.closest("table") !== table) return;
        row?.querySelector<HTMLButtonElement>(":scope > td > [data-compact-index] > button[role=checkbox]")?.click();
      };
      root.addEventListener("click", onClick);
      return () => root.removeEventListener("click", onClick);
    }}>
    <DSDataTable {...props} labels={labels} className={className} rows={rows} rowKey={rowKey} columns={[leading, ...columns]} />
  </div>;
}
