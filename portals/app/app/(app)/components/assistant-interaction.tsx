"use client";

import { useMediaQuery } from "@vxture/design-ui";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface AssistantInteraction {
  readonly recommendationsOpen: boolean;
  readonly setRecommendationsOpen: (open: boolean) => void;
  readonly onInput: () => void;
}
const Context = createContext<AssistantInteraction | null>(null);
export function AssistantInteractionProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const shortViewport = useMediaQuery("(max-height: 600px)");
  useEffect(() => { if (shortViewport) setOpen(false); }, [shortViewport]);
  return <Context.Provider value={{ recommendationsOpen: open, setRecommendationsOpen: setOpen, onInput: () => setOpen(false) }}>{children}</Context.Provider>;
}
export function useAssistantInteraction() { return useContext(Context); }
