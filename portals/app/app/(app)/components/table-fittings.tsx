"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Pagination,
  type ActionMenuItem,
  type DataTableSort,
  type PageSizeChoice,
} from "@vxture/design-ui";
import { ActionMenu } from "./business-controls";
import { sortRowsBy } from "../lib/table-sort";
import { useMessages } from "../lib/i18n/provider";
import type { MoveDirection } from "../../domains/shared/ordering";

// Business lists start with a 64px index. When there is a selection action,
// DataTable can share that column with its checkbox. The rightmost action
// column keeps its place across permission levels.

/*
 * 选择列 / 序号列 / 操作列 一律固定 64px - owner ruling, 2026-09-06.
 *
 * THE DS NOW DOES THIS ITSELF (design-ui 11, DS 14): its edge and action
 * header cells carry `w-table-col-fixed`, a density-scaled token that is 64px
 * at default density. `EDGE_COLUMNS` / `ACTION_COLUMN` lived here to state
 * 4rem because the DS used to size those cells with `w-control-3xl` (56px,
 * TD-022). Measured 2026-09-26 on /catalog, /admin/org, /admin/roles and
 * /admin/permissions at 1920px and 1280px: stripping the two classes left
 * every column at the same width to the pixel. So they are gone, and a table
 * that needs a WIDER action column (an inline key action beside the dots)
 * still states its own `[&_thead_th:last-child]:w-[...]`.
 *
 * WHAT STILL HOLDS: under `table-fixed`, a specified width is only honoured
 * while some column is left auto to absorb the slack. With every column
 * pinned, the surplus is shared out proportionally and the "fixed" edge
 * columns grow with everything else - measured at 1920px, a 1096px container
 * stretched 选择 and 序号 from 56px to 100px. The DS pinning the edges does
 * not change that physics, so the rule is still: LEAVE THE TITLE COLUMN AUTO
 * (table-fittings.test.ts guards it for every `table-fixed` table).
 */

// `MoneyCell` WAS HERE and design-ui 8.0.0 replaced it: `align:"numeric"` is
// right alignment plus one step of right padding plus tabular-nums, which is
// exactly what it hand-rolled. A missing element is a request to the DS
// rather than a local build (CLAUDE.md); the request landed, so the local
// build goes.

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
export { sortRowsBy } from "../lib/table-sort";

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
  const { DS_LABELS } = useMessages();
  return (
    <ActionMenu items={items} disabled={disabled || items.length === 0} label={label ?? DS_LABELS.actionMenu} />
  );
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

/**
 * 分页页脚 - owner ruling (表格列宽新一轮规则, 规则 5): DS 格式的页脚，左侧
 * 统计信息，右侧翻页组件组。DS 的 `Pagination` 本身就是"左统计右翻页"一整条,
 * 缺省文案是英文（"15 records"/"Previous page"）- 跟 `DS_LABELS.actionMenu`
 * 同一个理由，每张表都要显式传中文覆盖，抽成一个共享件，不用 9 张表各自
 * 拼 7 个 prop。`filteredTotal` 给了就是"共 M 条记录，当前筛选 N 条"，不给
 * 就是"共 M 条记录" - 调用方决定当前是不是在筛选状态。
 */
export function PaginationFooter({
  pagination,
  total,
  filteredTotal,
}: {
  readonly pagination: {
    readonly page: number;
    readonly pageCount: number;
    readonly pageSize: PageSizeChoice;
    readonly onPageChange: (page: number) => void;
    readonly onPageSizeChange: (size: PageSizeChoice) => void;
  };
  readonly total: number;
  readonly filteredTotal?: number;
}) {
  const { DS_LABELS } = useMessages();
  return (
    <Pagination
      page={pagination.page}
      pageCount={pagination.pageCount}
      total={total}
      filteredTotal={filteredTotal}
      pageSize={pagination.pageSize}
      pageSizeOptions={[10, 20, 50]}
      onPageChange={pagination.onPageChange}
      onPageSizeChange={pagination.onPageSizeChange}
      countLabel={
        filteredTotal !== undefined
          ? DS_LABELS.paginationFilteredCount(filteredTotal, total)
          : DS_LABELS.paginationCount(total)
      }
      previousLabel={DS_LABELS.paginationPrevious}
      nextLabel={DS_LABELS.paginationNext}
      pageSizeLabel={DS_LABELS.paginationPageSizeLabel}
      pageSizeOptionTemplate={DS_LABELS.paginationPageSizeOptionTemplate}
    />
  );
}
