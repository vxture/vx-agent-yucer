import { getDictionary, type Dictionary } from "./dictionary";
import { resolveLocale } from "./locale";

// The dictionary, for server components.
//
// No argument: the locale comes from the request, which next/headers already
// caches per render, so calling this in several server components costs one
// resolution rather than one each. A component that also needs the locale
// itself - to format a date, say - should call resolveLocale() alongside this
// rather than have this return a pair nobody wants both halves of.

export async function getMessages(): Promise<Dictionary> {
  return getDictionary(await resolveLocale());
}
