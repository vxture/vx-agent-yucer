/** Shared content and dossier pane classes. List pages have no left module
 *  menu; object detail pages render their own facts beside the content. */

/** Object dossiers remain visible independently of the administration menu. */
export const BOARD_PANE_CLASS =
  "w-(--vx-pane-nav) h-full min-h-0 shrink-0 overflow-y-auto border-r border-border px-lg pt-lg pb-2xl";

/** AppShell supplies each edge inset according to the adjacent visible pane. */
export const CENTRE_PANE_CLASS =
  "h-full min-h-0 min-w-0 flex-1 overflow-y-auto ps-(--yucer-content-inset-start) pe-(--yucer-content-inset-end) pt-lg pb-2xl";

/** DS viewport dock: independently padded and separated from the work area. */
export const ASSISTANT_PANE_CLASS =
  "w-(--vx-pane-action) h-full min-h-0 shrink-0 overflow-hidden border-l border-border px-lg pt-lg pb-md";

/** The routes whose page renders the board and centre panes itself: an
 *  object's detail page, where 栏1 is that object's own dossier instead of
 *  the module nav. /account/<id> (2026-09-20) and /pipeline/<id> (deal batch
 *  2, 2026-09-25: 商机详情页与客户详情页同一级别). `complete` and `new` are
 *  sibling routes, not ids; a deeper route (/pipeline/<id>/lines) keeps the
 *  shell's own panes. */
const DOSSIER_SIBLINGS: Readonly<Record<string, readonly string[]>> = {
  account: ["complete", "new"],
  pipeline: ["new"],
};

export function isDossierRoute(segments: readonly string[]): boolean {
  if (segments.length !== 2) return false;
  const siblings = DOSSIER_SIBLINGS[segments[0]];
  return siblings !== undefined && !siblings.includes(segments[1]);
}
