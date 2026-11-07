// The header pieces design-system 15 did not carry to the new size ladder, and
// the size-only overrides that bring them there (TD-037).
//
// ONE PLACE, because two headers use them - the signed-in shell (app-shell.tsx,
// header-tools.tsx) and the four gate screens (gate-frame.tsx: sign-in,
// signed-out, no subscription, no roles). The owner asked for the same sizes on
// both (2026-10-08), and two copies of a selector string would drift.
//
// NAMED OVERRIDES (owner allows local CSS where the DS stops, 2026-09-24). Each
// sets header size and spacing, never colours, and each is removed
// when the DS follows the ladder (TD-037).

/** Product name 18px, descriptor 16px; tier shares their vertical center. */
export const PRODUCT_TITLE_ON_LADDER =
  "[&>span.font-brand]:text-lg [&>span.text-xl:not(.font-brand)]:text-base [&>[data-slot=header-superscript]]:items-center";

/** A 32px hit area does not dictate the glyph size. */
export const HEADER_ICON_CONTROL = "size-control-xl";
export const HEADER_LARGE_ICON = "[&_svg]:size-icon-lg";

/** ShellToolbox uses content-box and padding, so normalize its outer box. */
export const TOOLBOX_ON_LADDER =
  "gap-2xs p-0 [&_[data-slot^=shell-toolbox-]]:m-0 [&_[data-slot^=shell-toolbox-]]:box-border [&_[data-slot^=shell-toolbox-]]:size-control-xl [&_[data-slot^=shell-toolbox-]_svg]:size-icon-sm";

/** Keep the native 32px avatar inside a matching 32px trigger. */
export const AVATAR_ON_LADDER = "size-control-xl";

/** Text controls share the same 32px height as the icon controls. */
export const HEADER_TEXT_CONTROL = "h-control-xl";
export const HEADER_SEARCH_CONTROL = "[&_.h-control-md]:h-control-xl";

/** Scope identity stays fully visible, with no hover/open width jump. */
export const HEADER_SCOPE_CONTROL =
  "h-control-xl w-auto max-w-none shrink-0 hover:w-auto aria-expanded:w-auto [&>span]:overflow-visible [&>span]:text-clip";

/** User actions and preference controls share one 32px row rhythm. */
export const USER_PANEL_ON_LADDER = "[&_.h-control-md]:h-control-xl";
