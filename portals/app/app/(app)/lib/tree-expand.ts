// "展开到" - 权限策略的树状表已经有这个操作 (permission-tree.ts's keysDownTo):
// a labelled level button per rank, plus 全部收起, instead of a bare
// 全部展开/全部收起 pair that only ever shows everything or nothing. Every
// other tree-shaped admin table (组织架构 org-panel.tsx, 组织管理
// member-org-view.tsx) draws from the SAME two functions rather than a copy
// each, generalised from permission-tree's fixed four named ranks to a plain
// unit depth - an org tree's depth is not a fixed enum the way a permission
// code's domain/module/page/action is.

/** The depths worth offering a "展开到 Ln" button for - every depth some ROW
 *  actually reaches, branch or leaf alike (owner, 2026-09-12: 应该有多少层
 *  就要展开到多少层，后面层级不能没有). Pass every row the tree has, not
 *  only the ones that fold: a leaf tier still needs its own button even
 *  though nothing there ever folds - the button's job is "reveal down to
 *  here", not "this tier itself has children" - the same shape
 *  permission-tree.ts's own deepest rank ("action", never itself foldable)
 *  already has among its three buttons. Depth 0 is always shown on every
 *  one of these tables; a button for it would just fold everything, which
 *  全部收起 already does, so it is left out (permission-tree.ts's three
 *  buttons skip its equivalent root rank, "domain", the same way). */
export function depthLevels(rows: readonly { readonly depth: number }[]): number[] {
  return [...new Set(rows.map((r) => r.depth))].filter((d) => d > 0).sort((a, b) => a - b);
}

/** Fold every branch AT OR PAST a target depth, revealing rows through that
 *  depth and hiding anything deeper - "展开到 L2" collapses L2 (and deeper)
 *  branches so their own children, at L3, stay hidden, while L2 itself and
 *  everything above it stays open. Takes only the rows that CAN fold - a
 *  leaf has no children to hide, so it never needs collapsing regardless of
 *  its own depth. The deepest depth `depthLevels` offers folds nothing here
 *  (no branch reaches past it - a leaf tier's own button, for instance,
 *  never matches anything), so it is already "展开全部" without a separate
 *  all-expand entry, the same shape permission-tree.ts's deepest level
 *  ("action") has. */
export function collapseFromDepth<T extends { readonly id: string; readonly depth: number }>(
  branches: readonly T[],
  targetDepth: number,
): Set<string> {
  return new Set(branches.filter((b) => b.depth >= targetDepth).map((b) => b.id));
}
