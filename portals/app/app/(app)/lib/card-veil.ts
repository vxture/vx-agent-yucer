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
