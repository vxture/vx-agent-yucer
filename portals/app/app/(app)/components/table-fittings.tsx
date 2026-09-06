"use client";

import type { MouseEvent } from "react";
import { ActionMenu, type ActionMenuItem } from "@vxture/design-ui";

// 表格三件标配 - owner ruling, 2026-09-06.
//
// Every table in this product carries the same three fittings, in this order:
//
//   1. 选择列   - the checkbox column (DS: `selectedKeys` + `onSelectionChange`)
//   2. 序号列   - the row number   (DS: `indexStart`)
//   3. 操作列   - pinned right     (DS: `rowActions`)
//
// They are FITTINGS, not features: their job is that two tables in this
// product have the same grid, so a reader moving between modules does not
// re-learn where things are. What a fitting DOES is each page's business.
//
// THE ACTION COLUMN IS ALWAYS THERE, EVEN WITH NOTHING IN IT (the ruling's
// second half). A reader who may not act used to get a table one column
// narrower than the same table shown to a colleague, which is a different
// grid for the same data - and it was the source of a real defect, because
// per-column widths counted from the right then landed one column over for
// exactly that reader (review, 2026-09-05). `RowActions` below renders the
// DS trigger with an empty, disabled menu instead: the column holds its
// place, and the three dots say "nothing you can do here" rather than
// vanishing and taking the geometry with them.
//
// WIDTH CLASSES COUNT FROM THE LEFT, and with the selection column present
// the leading pair is always `选择 | 序号`, so the first business column is
// `nth-child(3)`. That is the whole reason left-counting works: everything
// to the left of the business columns is unconditional, everything
// conditional is to the right of them.

/**
 * The action column's contents - a single DS trigger, always rendered.
 *
 * `items` may be empty. An empty menu is disabled outright rather than
 * openable-and-blank: DS's own distinction is that per-item `disabled` still
 * lets you open the menu and see what exists, while whole-menu `disabled`
 * says there is nothing to see. With no items, the second is the true one.
 */
export function RowActions({
  items,
  disabled,
  label,
}: {
  readonly items: readonly ActionMenuItem[];
  /** Something is in flight - the menu is temporarily closed for business. */
  readonly disabled?: boolean;
  readonly label?: string;
}) {
  return (
    <ActionMenu items={items} disabled={disabled || items.length === 0} label={label} />
  );
}

/**
 * Click anywhere on a row to select it - owner ruling, 2026-09-06 (点击整行进行
 * 选中切换，无需必须点击选择框：太小，不好点).
 *
 * Returned as a handler for the WRAPPER, not for each row: `DataTable` has no
 * `onRowClick`, and the alternative - a click handler injected into every
 * cell's rendered output - would put this concern inside every column
 * definition in the product. One listener on the container, mapped back to a
 * row by its position in `tbody`, keeps the DS component untouched.
 *
 * THREE THINGS DO NOT TOGGLE, and each is a real click somebody makes:
 *   - anything interactive inside the row (the action trigger, a link, the
 *     checkbox itself) - the row would otherwise steal every one of them, and
 *     the checkbox would toggle twice and land back where it started;
 *   - a click that ends a text SELECTION - copying a product code out of a
 *     cell is a drag, and a drag that silently ticks a box is a surprise;
 *   - a click on the header or on an empty-state row.
 *
 * The row list is passed in because a module page renders this helper once per
 * table (live and settled are two tables), and each has its own row order.
 */
export function rowClickSelection<T>(
  rows: readonly T[],
  rowKey: (row: T) => string,
  selected: readonly string[],
  setSelected: (keys: readonly string[]) => void,
): { readonly onClick: (e: MouseEvent<HTMLDivElement>) => void; readonly className: string } {
  return {
    className: "[&_tbody_tr]:cursor-pointer",
    onClick: (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("button, a, input, label, [role=checkbox], [role=menuitem], [aria-haspopup]"))
        return;
      if ((window.getSelection()?.toString() ?? "") !== "") return;

      const tr = target.closest("tbody tr");
      const body = tr?.parentElement;
      if (!tr || !body) return;
      const at = [...body.children].indexOf(tr);
      const row = at >= 0 ? rows[at] : undefined;
      if (row === undefined) return;

      const key = rowKey(row);
      setSelected(
        selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key],
      );
    },
  };
}
