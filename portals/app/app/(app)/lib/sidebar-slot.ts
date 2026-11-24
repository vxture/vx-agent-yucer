/** Shared dock classes and dossier routes. List pages have no left module
 *  menu; object detail pages render their own facts beside the content. */

/** DS viewport dock: independently padded and separated from the work area. */
export const ASSISTANT_PANE_CLASS =
  "h-full min-h-0 overflow-hidden px-lg pb-[calc(var(--space-md)+env(safe-area-inset-bottom,0px))]";

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
