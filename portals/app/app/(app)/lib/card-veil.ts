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
 */
export const CARD_VEIL_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, color-mix(in srgb, var(--gradient-card-from) calc(var(--opacity-veil-base-top) * 100%), transparent), color-mix(in srgb, var(--gradient-card-to) calc(var(--opacity-veil-base-bottom) * 100%), transparent))",
};
