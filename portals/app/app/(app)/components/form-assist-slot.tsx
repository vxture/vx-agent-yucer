"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useId, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

// Where a form page's 智能填写 renders (owner 2026-09-28): in 栏3, under the
// 记一笔 box, not as a second column squeezed into the centre pane.
//
// A SLOT, NOT A COPY. The suggestions read the form's unsaved state and
// 采用 fills its fields, so they have to stay part of the form's React tree.
// The shell provides one DOM node in the deck; FormPage portals its assist
// into it. The deck is a parallel route, but it renders inside AppShell like
// the page does, so both sit under this one provider.

interface AssistSlots {
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
  conversationSlot: HTMLElement | null;
  setConversationSlot: (el: HTMLElement | null) => void;
  conversationOwner: string | null;
  setConversationOwner: Dispatch<SetStateAction<string | null>>;
}
const SlotContext = createContext<AssistSlots | null>(null);

export function FormAssistSlotProvider({ children }: { readonly children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [conversationSlot, setConversationSlot] = useState<HTMLElement | null>(null);
  const [conversationOwner, setConversationOwner] = useState<string | null>(null);
  return <SlotContext.Provider value={{ slot, setSlot, conversationSlot, setConversationSlot, conversationOwner, setConversationOwner }}>{children}</SlotContext.Provider>;
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


/** A page keeps its draft and conversation state; only the rendering moves. */
export function usePageAssistantSlot(): HTMLElement | null {
  const ctx = useContext(SlotContext);
  const owner = useId();
  const setOwner = ctx?.setConversationOwner;
  useEffect(() => {
    if (!setOwner) return;
    setOwner(owner);
    return () => setOwner(current => current === owner ? null : current);
  }, [owner, setOwner]);
  return ctx?.conversationSlot ?? null;
}

/** Replace the generic capture surface only while its business page is mounted. */
export function PageAssistantOutlet({ children }: { readonly children: ReactNode }) {
  const ctx = useContext(SlotContext);
  const pathname = usePathname();
  // This route's form owns the conversation, including its server render.
  // Waiting for its registration effect would flash the generic capture first.
  const ownsConversation = pathname === "/account/new" || !!ctx?.conversationOwner;
  if (!ctx || !ownsConversation) return children;
  return <div ref={ctx.setConversationSlot} className="flex min-h-0 flex-1 flex-col" data-page-assistant-slot />;
}
