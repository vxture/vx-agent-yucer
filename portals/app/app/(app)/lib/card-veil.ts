import type { CSSProperties } from "react";

/**
 * The DS's own card surface, reproduced for every Section-based card on this
 * page - sidebar AND content alike.
 *
 * `@vxture/design-ui`'s `Card` component paints this by default (a `surface`
 * prop feeds its internal `cardVeil()` helper - verified by reading the
 * compiled DS: `Card`/`EntryCard`/`MetricListCard` all use it, always, active
 * or not). `PanelCard` - the actual component /account's own content column
 * uses for its "逾期" alert block - is *itself* just `Card` underneath (its
 * compiled source: `function PanelCard(...) { return jsx(Card, {...}) }`),
 * so sidebar's NavBoard cards and content's PanelCard are the SAME visual
 * recipe, not two different ones - there is one card language on /account,
 * not a sidebar one and a content one (owner, 2026-09-20: confirmed after
 * checking - "聚焦content" turned out to want the identical fix already
 * applied to sidebar, not a second recipe).
 *
 * `Section` (`tone="raised"`, what every card on the account detail page is
 * built from, for its title/description/action header) is a different DS
 * component with no `surface` prop - it reaches for `bg-card` (opaque white)
 * plus `ring-1 ring-foreground/10` (a box-shadow ring, near-black) plus a
 * `shadow-raised` drop shadow plus `rounded-xl`/`p-lg` - a completely
 * different recipe from the DS's real card surface
 * (`rounded-md border border-primary/10 dark:border-primary/20`, no ring, no
 * shadow, `p-md`) - confirmed by diffing computed styles side by side, not
 * guessed from the class names alone.
 *
 * `cardVeil()`/`veil.base` are not part of the DS's public API, so nothing
 * here is imported from it - CARD_VEIL_STYLE's gradient and CARD_VEIL_CLASS's
 * classes are the same CSS/Tailwind utilities the DS emits, built from the
 * same global custom properties (`--gradient-card-from/to`,
 * `--opacity-veil-base-top/bottom`) and the same border/radius tokens the
 * DS's own theme already defines.
 */
export const CARD_VEIL_STYLE: CSSProperties = {
  /**
   * LOAD-BEARING, not decoration - the first pass of this fix left it out and
   * the result rendered as plain white (owner: "样本浅蓝色渐变，你是纯白色").
   * `Card` never sets its own background-color at all (confirmed:
   * `rgba(0,0,0,0)` on every real `Card` checked), so its gradient's own
   * transparent end lets the page's actual background (`rgb(244,247,253)`, a
   * pale blue - not white) show through and read as a tint. `Section`'s
   * `tone="raised"` sets an OPAQUE `bg-card` (`rgb(255,255,255)`) UNDER the
   * gradient - background-image always paints over background-color on the
   * same box - so the same gradient was compositing over solid white instead
   * of the page's blue, and a mostly-transparent veil over solid white is
   * indistinguishable from white. Inline style beats the class regardless of
   * Tailwind/cn merge order, so this is the one place `bg-card` can be
   * cancelled without touching `Section` itself or any of its other tones.
   */
  backgroundColor: "transparent",
  backgroundImage:
    "linear-gradient(180deg, color-mix(in srgb, var(--gradient-card-from) calc(var(--opacity-veil-base-top) * 100%), transparent), color-mix(in srgb, var(--gradient-card-to) calc(var(--opacity-veil-base-bottom) * 100%), transparent))",
  /**
   * `shadow-raised` is this app's own custom utility (not a stock Tailwind
   * class), so tailwind-merge does not recognise it as conflicting with the
   * `shadow-none` in CARD_VEIL_CLASS below - a residual `0 1px 2px` drop
   * shadow at 5% opacity survived a className-only override (checked via
   * computed style: the reference's `boxShadow` was the literal keyword
   * `none`; this page's was still a multi-layer stack with one non-zero
   * layer left). Inline style overrides unconditionally regardless of which
   * class "wins" the merge, same reasoning as backgroundColor above.
   */
  boxShadow: "none",
};

/**
 * The DS's own card BORDER/radius/padding, as a className (paired with
 * CARD_VEIL_STYLE above on every card).
 *
 * `cn()` (this DS's className merger) is tailwind-merge under the hood
 * (confirmed by reading the compiled source), so passing this as `className`
 * deterministically overrides Section's own `tone="raised"` classes for the
 * SAME utility groups (rounded/border/ring/shadow/padding) rather than
 * fighting them via CSS cascade order.
 */
export const CARD_VEIL_CLASS =
  "rounded-md border border-primary/10 dark:border-primary/20 ring-0 shadow-none p-md";
