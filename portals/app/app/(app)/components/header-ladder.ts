// The header pieces design-system 15 did not carry to the new size ladder, and
// the size-only overrides that bring them there (TD-037).
//
// ONE PLACE, because two headers use them - the signed-in shell (app-shell.tsx,
// header-tools.tsx) and the four gate screens (gate-frame.tsx: sign-in,
// signed-out, no subscription, no roles). The owner asked for the same sizes on
// both (2026-10-08), and two copies of a selector string would drift.
//
// NAMED OVERRIDES (owner allows local CSS where the DS stops, 2026-09-24). Each
// only sets a size, never a colour, spacing or structure, and each is removed
// when the DS follows the ladder (TD-037).

/** ShellProductTitle hard-codes `text-xl font-semibold` (20px) on the name and
 *  the type; its sibling ShellHeaderTitle is heading-3 (14px). */
export const PRODUCT_TITLE_ON_LADDER = "[&_span.text-xl]:text-heading-3";

/** ShellToolbox draws 20px icons in 28px areas; every other header control is
 *  24px with a 16px icon. A 16px box plus its own 4px padding is 24px. */
export const TOOLBOX_ON_LADDER =
  "[&_[data-slot^=shell-toolbox-]]:size-icon-sm [&_[data-slot^=shell-toolbox-]_svg]:size-icon-sm";

/** ShellUserMenu draws the avatar at a fixed 32px inside a 24px icon button. */
export const AVATAR_ON_LADDER = "[&_.size-icon-xl]:size-icon-lg";
