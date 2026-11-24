"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ArrowsInLineHorizontal, ArrowsOutLineHorizontal } from "@phosphor-icons/react";
import { Button } from "@vxture/design-ui";
import type { AssistantWidth } from "../lib/shell-cookies";
import { useMessages } from "../lib/i18n/provider";

const Context = createContext<{
  readonly width: AssistantWidth;
  readonly toggle: () => void;
} | null>(null);

/** One shell preference for both the workboard conversation and page docks. */
export function AssistantWidthProvider({ width, toggle, children }: {
  readonly width: AssistantWidth;
  readonly toggle: () => void;
  readonly children: ReactNode;
}) {
  return <Context.Provider value={{ width, toggle }}>{children}</Context.Provider>;
}

export function useAssistantWidth() {
  const value = useContext(Context);
  if (!value) throw new Error("AssistantWidthProvider is required");
  return value;
}

export function AssistantWidthToggle({ wide, onToggle }: {
  readonly wide: boolean;
  readonly onToggle: () => void;
}) {
  const { ASSISTANT_PANEL_TEXT: T } = useMessages();
  const WidthIcon = wide ? ArrowsInLineHorizontal : ArrowsOutLineHorizontal;
  return <Button type="button" variant="ghost" size="icon-xl"
    aria-label={wide ? T.narrow : T.wide} title={wide ? T.narrow : T.wide}
    aria-pressed={wide} data-assistant-width-toggle onClick={onToggle}>
    <WidthIcon size={16} weight="regular" aria-hidden="true" />
  </Button>;
}
