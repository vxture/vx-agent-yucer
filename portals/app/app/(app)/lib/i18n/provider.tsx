"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@vxture/shared";
import { getDictionary, type Dictionary } from "./dictionary";

// The dictionary, for client components.
//
// IT TAKES A LOCALE, NOT A DICTIONARY, and that is forced rather than chosen:
// the dictionaries contain FUNCTIONS - `lead: (n) => ...` - and a function
// cannot cross the server/client boundary. React refuses to serialise it, the
// same way it refuses DataTableColumn.cell. So the server hands down a string
// and this module resolves it on the client from modules it imports itself.
//
// The cost, stated: BOTH dictionaries ship in the client bundle. At two locales
// that is a few kilobytes and the right trade against a round trip for copy. At
// ten it would not be, and the fix then is a dynamic import keyed by locale -
// which is a change to this file alone, because nothing outside it names a
// dictionary.

const MessagesContext = createContext<Dictionary | null>(null);

export function MessagesProvider({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
}) {
  const value = useMemo(() => getDictionary(locale), [locale]);
  return (
    <MessagesContext.Provider value={value}>
      {children}
    </MessagesContext.Provider>
  );
}

/**
 * The active dictionary.
 *
 * THROWS outside the provider rather than falling back to Chinese. A silent
 * fallback would make a missing provider invisible until someone switched
 * locale and found one subtree stubbornly in the wrong language - a bug that
 * only appears for the users least able to report it.
 */
export function useMessages(): Dictionary {
  const value = useContext(MessagesContext);
  if (!value) {
    throw new Error("useMessages must be called inside <MessagesProvider>");
  }
  return value;
}
