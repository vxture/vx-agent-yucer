"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { FilterBarView } from "@vxture/design-ui";
import { COLLECTION_VIEW_COOKIE } from "../lib/collection-view";

const CollectionView = createContext<{
  readonly value: FilterBarView | undefined;
  readonly select: (view: FilterBarView) => void;
} | null>(null);

export function CollectionViewProvider({ initial, children }: {
  readonly initial?: FilterBarView;
  readonly children: ReactNode;
}) {
  const [value, setValue] = useState(initial);
  const select = useCallback((view: FilterBarView) => {
    setValue(view);
    document.cookie = `${COLLECTION_VIEW_COOKIE}=${view}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, []);
  const preference = useMemo(() => ({ value, select }), [value, select]);

  return <CollectionView.Provider value={preference}>{children}</CollectionView.Provider>;
}

// The module defaults only apply until the first explicit choice.
export function useCollectionView(fallback: FilterBarView) {
  const preference = useContext(CollectionView);
  if (!preference) throw new Error("CollectionViewProvider is required");
  return [preference.value ?? fallback, preference.select] as const;
}
