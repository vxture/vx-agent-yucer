"use client";

import { LOCALE_CONSTANTS, type Locale } from "@vxture/shared";

// Writing the locale choice, from the switcher.
//
// A COOKIE AND NOT localStorage, even though the platform names a storage key
// too: the server has to read this before it renders anything, and
// localStorage does not exist there. Storing it only on the client would mean
// a first paint in the wrong language followed by a swap - and the swap is
// every string on the page, not a detail.
//
// Written on the toggle rather than on unload, so the next full load is right
// even if this tab is killed.

export function writeLocale(locale: Locale): void {
  // A year: the choice is a preference, not a session fact. SameSite=Lax so it
  // survives a normal navigation back into the app; no Secure flag hard-coded
  // because dev is http and a cookie that never sets in dev is a cookie nobody
  // tests.
  document.cookie = `${LOCALE_CONSTANTS.COOKIE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
