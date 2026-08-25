import { PROPOSAL_TEXT } from "./messages";

// The copy this product hands to the design system.
//
// WHY A SHARED CONSTANT AND NOT A STRING AT EACH CALL SITE. As of design-ui
// 5.0 every DS copy outlet falls back to ENGLISH, and its changelog is explicit
// about what that means: the fallback exists so a missed prop renders something
// legible instead of `undefined`, not so anyone can rely on it. An English
// default reaching a production screen means someone forgot to pass one.
//
// The DS ships no locale context and does not intend to, so passing is the
// product's job - and the compiler cannot help, because every one of these
// props is optional. That leaves two failure modes, and a shared constant is
// the only thing that answers both: the same 「取消」 growing three different
// spellings across three pages, and nobody being able to say which outlets are
// still unpassed. A file you can read top to bottom answers the second by
// existing.
//
// VERIFIED AGAINST THE SHIPPED BUNDLE, not against the .d.ts. The type's own
// doc comment still claims titleTemplate defaults to the Chinese
// `"{verb}{target}？"`; the compiled default is `"{verb} {target}?"`. The
// comment is stale and a product that trusted it would ship
// "判定不合格 线索？" with a half-width question mark and a stray space.

/** Confirmation dialogs for destructive actions. */
export const CONFIRM_LABELS = {
  /**
   * Chinese word order and full-width punctuation, passed explicitly.
   *
   * The DS used to compose `${verb}${target}？` itself and 4.1 opened this prop
   * precisely to hand word order back to the caller. 5.0 finished the job by
   * making the fallback neutral, which means a Chinese product must now say so.
   */
  titleTemplate: "{verb}{target}？",
  cancelLabel: "取消",
  pendingLabel: "处理中…",
} as const;

/** The row-level action trigger. Its default accessible name is English. */
export const ACTION_MENU_LABEL = "更多操作";

/** The list toolbar. */
export const FILTER_BAR_LABELS = {
  resetLabel: "重置筛选",
  viewModeLabel: "视图模式",
} as const;

/**
 * Bulk selection. The template and the noun MUST move together - the changelog
 * calls this out by name, because passing only one yields 「已选择 3 items」.
 */
export const BULK_LABELS = {
  toolbarLabel: "批量操作",
  clearLabel: PROPOSAL_TEXT.clearSelection,
  noun: PROPOSAL_TEXT.selectionNoun,
  selectionTemplate: "已选择 {count} {noun}",
} as const;

/** Toasts. Both outlets are accessible names a reader never sees but hears. */
export const TOAST_LABELS = {
  regionLabel: "通知",
  dismissLabel: "关闭通知",
} as const;
