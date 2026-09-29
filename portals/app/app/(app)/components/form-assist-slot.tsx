"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Where a form page's 智能填写 renders (owner 2026-09-28): in 栏3, under the
// 记一笔 box, not as a second column squeezed into the centre pane.
//
// A SLOT, NOT A COPY. The suggestions read the form's unsaved state and
// 采用 fills its fields, so they have to stay part of the form's React tree.
// The shell provides one DOM node in the deck; FormPage portals its assist
// into it. The deck is a parallel route, but it renders inside AppShell like
// the page does, so both sit under this one provider.

const SlotContext = createContext<{ slot: HTMLElement | null; setSlot: (el: HTMLElement | null) => void } | null>(null);

export function FormAssistSlotProvider({ children }: { readonly children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return <SlotContext.Provider value={{ slot, setSlot }}>{children}</SlotContext.Provider>;
}

/** The node in the deck. Empty - and so hidden, taking no gap - on every page without a form. */
export function FormAssistSlot() {
  const ctx = useContext(SlotContext);
  return <div ref={ctx?.setSlot} className="flex flex-col gap-sm empty:hidden" />;
}

/** The deck's slot, or null when the deck is shut (or there is no shell). */
export function useFormAssistSlot(): HTMLElement | null {
  return useContext(SlotContext)?.slot ?? null;
}
