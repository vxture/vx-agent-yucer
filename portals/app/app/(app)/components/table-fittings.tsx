"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActionMenu,
  type ActionMenuItem,
  type DataTableSort,
} from "@vxture/design-ui";
import type { MoveDirection } from "../../domains/shared/ordering";

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
 * 选择列 / 序号列 / 操作列 一律固定 64px - owner ruling, 2026-09-06.
 *
 * TWO THINGS THIS FIXES, and they turned out to be one thing.
 *
 * The DS documents its edge columns as fixed 64px and ships `w-control-3xl`,
 * which measures 56px (TD-022 recorded the discrepancy; this is the owner
 * settling it at 64). So the width is stated here rather than taken from the
 * token.
 *
 * And under `table-fixed`, a specified width is only honoured while some
 * column is left auto to absorb the slack: with every column pinned, the
 * surplus is shared out proportionally and the "fixed" edge columns grow with
 * everything else. Measured at 1920px - a 1096px container stretched 选择 and
 * 序号 from 56px to 100px. So the rule has two halves and neither works
 * alone: PIN THE EDGES, LEAVE THE TITLE COLUMN AUTO.
 */
export const EDGE_COLUMNS =
  "[&_thead_th:nth-child(1)]:w-[4rem] [&_thead_th:nth-child(2)]:w-[4rem]";

/** The action column at its default 64px. A table that surfaces a key action
 * inline beside the dots states its own wider figure instead. */
export const ACTION_COLUMN = "[&_thead_th:last-child]:w-[4rem]";

// `MoneyCell` WAS HERE and design-ui 8.0.0 replaced it: `align:"numeric"` is
// right alignment plus one step of right padding plus tabular-nums, which is
// exactly what it hand-rolled - including the measured pad that made a
// right-aligned column read as centred. A missing element is a request to the
// DS rather than a local build (CLAUDE.md); the request landed, so the local
// build goes.
//
// THE WIDTH CLASSES ABOVE STAY. The DS still sizes its three fixed columns
// with `w-control-3xl`, and that token still measures 56px on 8.0.0 - TD-022
// is unchanged, and the owner's ruling is 64px.

/**
 * 工具行的两件量具 - the sizing the DS's `FilterBar` leaves to its caller.
 *
 * FilterBar takes NODES for its slots and does not size them, which is right:
 * it cannot know whether the thing you handed it is a search box or a date
 * range. But its right segment wraps, and a wrapping flex row picks its line
 * breaks from each item's BASIS before it shrinks anything on a line - so a
 * caller who just drops a DS control in gets three full-width children on
 * three rows, because DS form controls fill their container (correct in a
 * FORM, wrong in a tool row). Measured, 2026-09-07.
 *
 * 默认保证一行，弹性布局先压缩搜索框，再可换行 (owner, 2026-09-07). That order
 * is what these two encode, and it is NOT what flex-shrink gives you:
 *
 *   - `SearchSlot` is based at its MINIMUM and grows into the leftover width,
 *     so the row breaks lines as though the search box were already at 7rem.
 *     Every pixel above that is given back before anything wraps.
 *   - `FilterSlot` does not shrink at all. A select compressed to a stub is
 *     not a smaller control, it is an unreadable one - so the search box
 *     absorbs the whole squeeze and the filters keep their intrinsic width.
 *
 * They are wrappers rather than classNames on the controls because
 * `NativeSelect` forwards `className` to the <select> INSIDE its chevron
 * wrapper: sizing the control left the wrapper at the segment's full width,
 * and the row still rendered three lines.
 */
export function SearchSlot({ children }: { readonly children: ReactNode }) {
  return (
    <span className="block min-w-[7rem] max-w-[18rem] flex-1 basis-[7rem]">
      {children}
    </span>
  );
}

/**
 * One filter control in FilterBar's `children` group, at a fixed width.
 *
 * `width` is a Tailwind width class rather than a number: the filter's width
 * is a judgement about its longest option ("已转商机" needs more than "全部"),
 * and that judgement belongs at the call site where the options are.
 */
export function FilterSlot({
  width = "w-[8rem]",
  children,
}: {
  readonly width?: string;
  readonly children: ReactNode;
}) {
  return <span className={`block shrink-0 ${width}`}>{children}</span>;
}

/**
 * 列排序 - the caller's half of the DS's sort contract.
 *
 * `DataTable` draws the header control and the direction marker and does NOT
 * order anything ("排序本身由调用方做"). That leaves every table to write the
 * same three things: a piece of state, a change handler, and a comparator. The
 * comparator is the part worth writing once, because two of its rules are
 * judgements this product has already made elsewhere:
 *
 * 1. EMPTY SORTS LAST IN BOTH DIRECTIONS. A missing value is not a small one.
 *    This repo keeps saying so in other words - planning-table renders a blank
 *    rather than a zero because "nobody forecast this" and "this went badly"
 *    are different facts, and forecast-roster prints 未知 rather than 0 天 for a
 *    deal older than its journal. Sorting ascending and getting a block of
 *    blanks at the top would undo that in one click.
 * 2. TEXT COMPARES WITH `localeCompare`. A bare `<` orders by UTF-16 code unit,
 *    which is right for ASCII ids by luck and wrong for every Chinese name -
 *    the same defect Sonar caught in the owner dropdown on 2026-09-07.
 *
 * `accessors` maps a column id to the value that column SORTS ON, which is not
 * always what it renders: a cell showing "第 3 期" sorts on 3, and a cell
 * showing a badge sorts on the score inside it.
 */
/**
 * The comparator behind `useTableSort`, pulled out as a pure function so the
 * two judgements above are testable without rendering anything.
 */
export function sortRowsBy<R>(
  list: readonly R[],
  read: (row: R) => string | number | null | undefined,
  direction: "asc" | "desc",
): readonly R[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = read(a), y = read(b);
    const xEmpty = x === null || x === undefined || x === "";
    const yEmpty = y === null || y === undefined || y === "";
    // Rule 1, both halves: blanks sink whichever way the arrow points, so the
    // comparison below never sees one.
    if (xEmpty && yEmpty) return 0;
    if (xEmpty) return 1;
    if (yEmpty) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    // Rule 2: pinyin order, not UTF-16 code units.
    return String(x).localeCompare(String(y), "zh-CN") * dir;
  });
}

export function useTableSort<T>(
  rows: readonly T[],
  accessors: Readonly<Record<string, (row: T) => string | number | null | undefined>>,
  initial?: DataTableSort,
) {
  const [sort, setSort] = useState<DataTableSort | undefined>(initial);

  /* Exposed as a FUNCTION as well as a sorted array, because several modules
     render the same columns twice - 在建/结题, 待回款/已了结, 在售/退役 - from one
     helper. Those two tables must obey ONE sort state (asked to sort by 合同额,
     a reader means both lists), and a hook cannot be called from inside the
     helper. So the state lives at the top and the ordering travels down. */
  const sortRows = useCallback(
    <R extends T>(list: readonly R[]): readonly R[] => {
      if (!sort) return list;
      const read = accessors[sort.columnId];
      if (!read) return list;
      return sortRowsBy(list, read, sort.direction);
    },
    [sort, accessors],
  );

  const sorted = useMemo(() => sortRows(rows), [sortRows, rows]);

  return { sort, onSortChange: setSort, rows: sorted, sortRows };
}

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
 * Returned as a REF, and the listener is attached natively rather than as a
 * JSX `onClick`. Two reasons, and the second is the one that decided it:
 *
 *   - `DataTable` has no `onRowClick`, and the alternative to a container
 *     listener - injecting a handler into every column's rendered cell -
 *     would put this concern inside every column definition in the product.
 *   - A `<div onClick>` is a non-interactive element with a click handler and
 *     no keyboard listener, which Sonar flags (PR #197) and is right to. The
 *     answer is not `role="button"` + tabIndex on a container that is not a
 *     button - that would add a focus stop that does nothing. THE ROW IS NOT
 *     THE CONTROL: each row's checkbox is, it carries tabIndex 0 and Tab
 *     reaches it (measured), and this listener only adds a pointer affordance
 *     on top of it. Delegation over an existing control is what this is, so
 *     it is written as delegation rather than dressed up as a widget.
 *
 *     NOT VERIFIED HERE: whether Space actually activates the DS checkbox once
 *     focused. The browser harness does not deliver a real Space keypress - a
 *     native <input type=checkbox> control group failed the same way - so the
 *     question is open and belongs to the DS, not to this file. If it turns
 *     out the checkbox is focusable but not operable, that is a DS request
 *     (and a TD entry), and it would be true with or without this listener.
 *
 * React 19 lets a ref callback return its cleanup, so the listener is replaced
 * rather than stacked when the row list changes - which also keeps the closure
 * over `rows` and `selected` fresh without a ref-to-latest dance.
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
): {
  readonly ref: (el: HTMLDivElement | null) => (() => void) | undefined;
  readonly className: string;
} {
  return {
    className: "[&_tbody_tr]:cursor-pointer",
    ref: (el) => {
      if (!el) return undefined;
      const handler = (e: Event) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (
          target.closest(
            "button, a, input, label, [role=checkbox], [role=menuitem], [aria-haspopup]",
          )
        )
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
      };
      el.addEventListener("click", handler);
      return () => el.removeEventListener("click", handler);
    },
  };
}

/**
 * 行菜单的四个排序操作，一套 (owner, 2026-09-09: 各操作面板尽量统一):
 * 上移 / 下移 / 移到顶部 / 移到底部, greyed at the end they cannot pass, the
 * first with the separator that starts the group. `index` and `count` are
 * the row's place among the rows it is displayed WITH - a roster that splits
 * live from retired passes the group's, since a move lands beside a row the
 * person can see (planMove's `movable`).
 */
export function moveItems(
  ops: { readonly up: string; readonly down: string; readonly top: string; readonly bottom: string },
  index: number,
  count: number,
  move: (direction: MoveDirection) => void,
): ActionMenuItem[] {
  return [
    { id: "up", label: ops.up, separatorBefore: true, disabled: index === 0, onSelect: () => move("up") },
    { id: "down", label: ops.down, disabled: index === count - 1, onSelect: () => move("down") },
    { id: "top", label: ops.top, disabled: index === 0, onSelect: () => move("top") },
    { id: "bottom", label: ops.bottom, disabled: index === count - 1, onSelect: () => move("bottom") },
  ];
}
