import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_CONSTANTS,
  SUPPORTED_LOCALES,
  type Locale,
} from "@vxture/shared";

// Which language this request is in.
//
// EVERY PIECE OF THIS IS THE PLATFORM'S, NOT OURS. @vxture/shared already
// publishes the locale union, the supported list, the default, the cookie key
// and the locale-aware formatters. This product simply had not consumed any of
// it - messages.ts was a flat file of Chinese constants and view-model.ts grew
// its own formatMoney. Value-domain consumption is in CLAUDE.md's rigid zone:
// the answer to "what locales exist" is not a product decision.
//
// A PLAIN MODULE, deliberately - no "use client". A client module's exports
// become client-reference proxies when a server component imports them, which
// is how the shell cookie prefixes silently resolved to `undefined` once
// before. Locale has to be readable on the server, because the whole point is
// that the first paint is already in the right language.

/** The cookie the switcher writes and this reads. The platform names it. */
export const LOCALE_COOKIE = LOCALE_CONSTANTS.COOKIE_KEY;

/** Narrowing guard - a cookie is a string from the outside world. */
export function isLocale(value: string | undefined | null): value is Locale {
  return (
    value != null && (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * The best locale for a request, in three steps.
 *
 * 1. The cookie, because an explicit choice outranks a guess.
 * 2. Accept-Language, so a first visit is not automatically wrong.
 * 3. DEFAULT_LOCALE, which is the platform's answer and not ours.
 *
 * Step 2 matches on the PRIMARY SUBTAG - `zh-TW` and `zh-HK` resolve to zh-CN
 * rather than falling through to English. That is a deliberate over-reach: a
 * traditional-Chinese reader served simplified is inconvenienced, one served
 * English is stranded, and only the second is a failure.
 */
export async function resolveLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const accept = (await headers()).get("accept-language");
  if (accept) {
    for (const part of accept.split(",")) {
      const tag = part.split(";")[0]?.trim();
      if (!tag) continue;
      if (isLocale(tag)) return tag;
      const primary = tag.split("-")[0]?.toLowerCase();
      const match = SUPPORTED_LOCALES.find(
        (l) => l.split("-")[0]?.toLowerCase() === primary,
      );
      if (match) return match;
    }
  }

  return DEFAULT_LOCALE;
}
