import type { Dictionary } from "./i18n/dictionary";

// What went wrong on the model plane, in words a reader can act on.
//
// EXTRACTED FROM copilot-chat.tsx ON 2026-09-01, when a second surface started
// spending model turns and rendered `atlas_ATLAS_NOT_CONFIGURED` at somebody.
// The obvious fix was to add a translation to the new surface; the correct one
// is that there is exactly one mapping, because two would drift and the reader
// of the second would get the raw code again the next time Atlas renamed
// something.
//
// WHY THE REACHABLE-CODES GUARD DOES NOT CATCH THIS. That guard enumerates the
// violation codes a surface can return and demands a sentence for each. It
// cannot see these: `atlas_${e.code}` is COMPOSED AT RUNTIME from the platform's
// own error vocabulary, so the set is not knowable by reading this repo. A
// prefix fallback is the honest answer - we cannot promise a sentence per code
// we do not own, but we can promise never to print one raw.

/** True for anything the model plane produced, whatever it called it. */
export function isModelPlaneError(code: string): boolean {
  return code.startsWith("atlas_") || code === "no_active_tenant" || code === "tenant_required";
}

export function explainModelPlaneError(
  code: string,
  COPILOT_TEXT: Dictionary["COPILOT_TEXT"],
): string {
  if (
    code === "atlas_ATLAS_NOT_CONFIGURED" ||
    code === "no_active_tenant" ||
    code === "tenant_required"
  ) {
    return COPILOT_TEXT.errorNotConfigured;
  }
  // Atlas renamed GRANT_DENIED to NOT_ENTITLED on 2026-08-16. Both are matched:
  // this is the one message here that names a remedy, and losing it to a rename
  // would leave exactly the people who can fix the problem reading "something
  // went wrong".
  if (code === "atlas_NOT_ENTITLED" || code === "atlas_GRANT_DENIED") {
    return COPILOT_TEXT.errorNoGrant;
  }
  if (code === "atlas_QUOTA_EXCEEDED") return COPILOT_TEXT.errorQuota;
  return COPILOT_TEXT.errorGeneric;
}
