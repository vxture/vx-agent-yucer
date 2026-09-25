/** The shell's three-pane body, shared by app-shell.tsx and the one page that
 *  renders two of those panes itself (account/[id]/page.tsx).
 *
 *  owner, 2026-09-20: 死死记住这次的要求 - 客户详情页的栏1(单位信息/联系人/
 *  决策链摘要/档案缺口)搬进页面边的 sidebar 位置 - 保持边栏的布局(宽度、
 *  独立滚动、贴页面边), 只是这个特定路由下改放这个客户自己的档案。
 *
 *  SERVER-RENDERED, NOT PORTALED (fix, 2026-09-23). 栏1 used to be portaled
 *  from the page into an empty slot the shell rendered. A portal cannot run
 *  on the server, so the slot shipped empty and filled only after hydration -
 *  on a hard refresh the whole left pane went blank and reloaded while the
 *  centre and the deck arrived already rendered (owner report, 2026-09-23).
 *  Now the shell hands the page the row, and the page renders BOTH panes
 *  with these exact classes - same width, same independent scroll, one React
 *  tree (ChainViewProvider still spans both), and all of it in the first HTML.
 */

/** The left pane. Hidden, not unmounted, when the 战况板 toggle is off: the
 *  shell marks its body `data-board="hidden"`, and the pane is a member of
 *  that group. The page cannot read the toggle - it is client state. */
export const BOARD_PANE_CLASS =
  "w-(--vx-pane-nav) min-h-0 shrink-0 overflow-y-auto pb-2xl group-data-[board=hidden]/body:hidden";

/** The centre pane. See app-shell.tsx for why its padding is a measure. */
export const CENTRE_PANE_CLASS = "min-h-0 min-w-0 flex-1 overflow-y-auto px-md pb-2xl";

/** The routes whose page renders the board and centre panes itself: an
 *  object's detail page, where 栏1 is that object's own dossier instead of
 *  the module nav. /account/<id> (2026-09-20) and /pipeline/<id> (deal batch
 *  2, 2026-09-25: 商机详情页与客户详情页同一级别). `complete` and `new` are
 *  sibling routes, not ids; a deeper route (/pipeline/<id>/lines) keeps the
 *  shell's own panes. */
const DOSSIER_SIBLINGS: Readonly<Record<string, readonly string[]>> = {
  account: ["complete"],
  pipeline: ["new"],
};

export function isDossierRoute(segments: readonly string[]): boolean {
  if (segments.length !== 2) return false;
  const siblings = DOSSIER_SIBLINGS[segments[0]];
  return siblings !== undefined && !siblings.includes(segments[1]);
}
