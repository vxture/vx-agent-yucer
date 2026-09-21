import type { CSSProperties } from "react";

/**
 * The DS's own card-surface gradient, reproduced for Section-based cards.
 *
 * `@vxture/design-ui`'s `Card` component already paints this by default (a
 * `surface` prop feeds its internal `cardVeil()` helper - verified by reading
 * the compiled DS: `Card`/`EntryCard`/`PanelItem` all use it, always, active
 * or not - it is the ordinary card surface, not a highlight). `Section`
 * (`tone="raised"`) is a different DS component with no such prop - it paints
 * a flat `bg-card` instead - and this page's cards need `Section`'s own
 * title/description/action header, which `Card` does not have.
 *
 * `cardVeil()` itself is not part of the DS's public API, so this is not an
 * import - it is the same CSS the DS emits, built from the same global custom
 * properties (`--gradient-card-from/to`, `--opacity-veil-base-top/bottom`)
 * the DS's own theme already defines, confirmed by reading the rendered
 * output of a live `Card` (owner, 2026-09-20: 死死记住这次的要求 - 各板块
 * 背景采用渐变背景，参考 /account 卡片背景).
 *
 * backgroundColor: "transparent" IS LOAD-BEARING, not decoration - the first
 * pass of this fix left it out and the result rendered as plain white
 * (owner: "样本浅蓝色渐变，你是纯白色"). `Card` never sets its own
 * background-color at all (confirmed: `rgba(0,0,0,0)` on every real `Card`
 * checked), so its gradient's own transparent end lets the page's actual
 * background (`rgb(244,247,253)`, a pale blue - not white) show through and
 * read as a tint. `Section`'s `tone="raised"` sets an OPAQUE `bg-card`
 * (`rgb(255,255,255)`) UNDER the gradient - background-image always paints
 * over background-color on the same box - so the same gradient was
 * compositing over solid white instead of the page's blue, and a
 * mostly-transparent veil over solid white is indistinguishable from white.
 * Inline style beats the class regardless of Tailwind/cn merge order, so this
 * is the one place `bg-card` can be cancelled without touching `Section`
 * itself or any of its other tones.
 */
export const CARD_VEIL_STYLE: CSSProperties = {
  backgroundColor: "transparent",
  backgroundImage:
    "linear-gradient(180deg, color-mix(in srgb, var(--gradient-card-from) calc(var(--opacity-veil-base-top) * 100%), transparent), color-mix(in srgb, var(--gradient-card-to) calc(var(--opacity-veil-base-bottom) * 100%), transparent))",
};

/**
 * The DS's own card BORDER, for the sidebar cards specifically (owner,
 * 2026-09-20: 聚焦 sidebar - 背景和边框颜色还是不一样).
 *
 * `Section`'s `tone="raised"` reaches for `ring-1 ring-foreground/10` (a
 * box-shadow ring, near-black) plus a `shadow-raised` drop shadow and
 * `rounded-xl`/`p-lg` - a DIFFERENT recipe from the DS's actual card surface.
 * The sidebar's own cards (`Card`'s `veil.base`, compiled DS source) use a
 * REAL border instead, blue-tinted: `rounded-md border border-primary/10
 * dark:border-primary/20`, no ring, no drop shadow, `p-md`. Confirmed by
 * diffing computed styles side by side: reference had
 * `border: 1px solid oklab(...primary.../ 0.1)`, this page's card had
 * `border: 0px` and a `ring`+`shadow` box-shadow stack instead - a visibly
 * different edge, not just a different name for the same thing.
 *
 * `cn()` (this DS's className merger) is tailwind-merge under the hood
 * (confirmed by reading the compiled source), so passing this as `className`
 * deterministically overrides Section's own `tone="raised"` classes for the
 * SAME utility groups (rounded/border/ring/shadow/padding) rather than
 * fighting them via CSS cascade order.
 */
export const CARD_VEIL_CLASS =
  "rounded-md border border-primary/10 dark:border-primary/20 ring-0 shadow-none p-md";

/**
 * `boxShadow: "none"` as a STYLE, not just the `shadow-none` class above -
 * `shadow-raised` is this app's own custom utility (not a stock Tailwind
 * class), so tailwind-merge does not know it and `shadow-none` conflicts
 * with it - a residual `0 1px 2px` drop shadow at 5% opacity survived the
 * className override (checked via computed style: the reference's
 * `boxShadow` was the literal keyword `none`, this page's was still a
 * multi-layer stack with one non-zero layer left). Inline style overrides
 * unconditionally regardless of which class "wins" the merge, same reasoning
 * as CARD_VEIL_STYLE's own backgroundColor override above. Spread separately
 * from CARD_VEIL_STYLE (not merged into it) because only the sidebar cards
 * are in scope for the border/shadow match right now - the content column's
 * cards keep their existing shadow until that area gets its own pass.
 */
export const SIDEBAR_CARD_STYLE: CSSProperties = {
  ...CARD_VEIL_STYLE,
  boxShadow: "none",
};
