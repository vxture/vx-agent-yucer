"use client";

import { useRef, type ReactNode } from "react";
import { Button, Icon, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AssistantInteractionProvider } from "./assistant-interaction";
import { AssistantWidthToggle } from "./assistant-width";

export interface AssistantPanelProps {
  readonly children: ReactNode;
  readonly wide: boolean;
  readonly onToggleWidth: () => void;
  readonly onClose: () => void;
}

/** Frame only: the same conversation owns the header, focus and composer. */
export function AssistantPanel({ children }: AssistantPanelProps) {
  return <AssistantInteractionProvider><div className="flex h-full min-h-0 w-full flex-col overflow-hidden" data-assistant-frame>
    {children}
  </div></AssistantInteractionProvider>;
}

export function AssistantPanelControls({ wide, onToggleWidth, onClose, closeOnly = false }: Omit<AssistantPanelProps, "children"> & { readonly closeOnly?: boolean }) {
  const { ASSISTANT_PANEL_TEXT: T } = useMessages();
  const frame = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const close = () => {
    if (frame.current?.closest('[data-assistant-frame]')?.querySelector('[aria-busy="true"]')) toast({ tone: "info", title: T.continuesWhenClosed });
    onClose();
  };
  return <div ref={frame} className="flex shrink-0 items-center" role="group" aria-label={T.controls}>
        {!closeOnly ? <AssistantWidthToggle wide={wide} onToggle={onToggleWidth} /> : null}
        <Button type="button" variant="ghost" size="icon-xl" aria-label={T.close} title={T.close}
          data-assistant-close onClick={close}><Icon name="x" size="sm" /></Button>
  </div>;
}
