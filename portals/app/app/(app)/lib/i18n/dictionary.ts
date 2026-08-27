import { DEFAULT_LOCALE, type Locale } from "@vxture/shared";
import * as zh from "../messages";
import { en } from "../messages.en";

// The dictionary: one shape, one entry per locale.
//
// WHY messages.ts STAYS AS IT IS. It is 1592 lines across 61 constants and it
// is already the zh-CN dictionary - rewriting it into a nested locale map would
// have touched every one of the 54 files that import from it, for no gain. It
// keeps its named exports; this module reads it as a namespace and treats its
// SHAPE as the contract every other locale has to satisfy.
//
// THE TYPE IS WIDENED, and that is not laziness. messages.ts declares its
// constants `as const`, so `SHELL_TEXT.brandName` has the literal type
// "Yucer 销售智能体" - and an English translation is by definition not that
// literal. Widen maps literals back to their base types while leaving function
// signatures alone, so `lead: (n: number) => string` stays fully checked and a
// translator cannot quietly change an arity.

type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends (...args: infer A) => infer R
        ? (...args: A) => R
        : { -readonly [K in keyof T]: Widen<T[K]> };

/** The shape every locale must satisfy. Derived from zh-CN, never hand-kept. */
export type Dictionary = Widen<typeof zh>;

/**
 * The registry.
 *
 * zh-CN is the module itself. en-US spreads it and overrides what has been
 * translated so far, which is deliberate on three counts: it TYPE-CHECKS every
 * override against its Chinese counterpart, it is COMPLETE by construction so
 * no screen can render `undefined`, and what remains untranslated is countable
 * rather than invisible - the thing the DS changelog asked for and could not
 * get from a compiler.
 */
const DICTIONARIES: Record<Locale, Dictionary> = {
  "zh-CN": zh as Dictionary,
  "en-US": en,
};

/** Falls back to the platform default rather than throwing: a locale we do not
 *  have is a reason to render Chinese, never a reason to render nothing. */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}
