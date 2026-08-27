// The two flank-collapse cookie namespaces.
//
// They live in a plain module, NOT beside the shell that consumes them, and the
// reason is a trap worth naming: app-shell.tsx is "use client", and a value
// imported from a client module into a SERVER component does not arrive as that
// value - React hands the server graph a client reference proxy instead. The
// layout read `undefined` as the prefix, asked for a cookie called
// `vx_undefined_nav_collapsed`, found nothing, and concluded both flanks were
// open. Nothing threw; the flanks just silently forgot their state on every
// reload while the toggles still worked, which points the investigation at the
// client and away from the actual cause.
//
// Separate keys for the two flanks because they are separate decisions: someone
// who shuts the agent deck to read a long case has not asked to lose their own
// standing at the same time.
export const BOARD_COOKIE_PREFIX = "yucer-board";
export const DOCK_COOKIE_PREFIX = "yucer-dock";
