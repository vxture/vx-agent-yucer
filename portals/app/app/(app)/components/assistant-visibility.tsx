"use client";

import { createContext, useContext, type ReactNode } from "react";

const Context = createContext<{ readonly open: () => void; readonly close: () => void; readonly isOpen: boolean } | null>(null);

/** Shell visibility only; the shared Xiaoyu provider owns task continuity. */
export function AssistantVisibilityProvider({ children, ...value }: {
  readonly children: ReactNode;
  readonly open: () => void;
  readonly close: () => void;
  readonly isOpen: boolean;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAssistantVisibility() {
  const value = useContext(Context);
  if (!value) throw new Error("AssistantVisibilityProvider is required");
  return value;
}
