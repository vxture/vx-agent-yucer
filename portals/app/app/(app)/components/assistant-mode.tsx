"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, Icon, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { changeAutonomy } from "../copilot/actions";

interface ModeState {
  readonly selected: string;
  readonly disabled: boolean;
  readonly change: (value: string) => void;
}
const ModeContext = createContext<ModeState | null>(null);

/** Shared above the shell so form-owned portals see the same authority state. */
export function AssistantModeProvider({ mode, canChange, children }: {
  readonly mode?: string;
  readonly canChange: boolean;
  readonly children: ReactNode;
}) {
  const { AUTONOMY_TEXT, AUTONOMY_ERROR } = useMessages();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState(mode ?? "ask_always");
  useEffect(() => { setSelected(mode ?? "ask_always"); }, [mode]);
  const { toast } = useToast();
  const router = useRouter();
  const change = (value: string) => {
    if (!canChange || pending || value === selected) return;
    start(async () => {
      try {
        const result = await changeAutonomy({ mode: value });
        if (!result.ok) {
          toast({ tone: "danger", title: AUTONOMY_ERROR[result.error ?? "denied"] ?? AUTONOMY_ERROR.denied });
          return;
        }
        setSelected(value);
        toast({ tone: "success", title: AUTONOMY_TEXT.saved });
        router.refresh();
      } catch {
        toast({ tone: "danger", title: AUTONOMY_ERROR.denied });
      }
    });
  };
  return <ModeContext.Provider value={mode ? { selected, disabled: !canChange || pending, change } : null}>{children}</ModeContext.Provider>;
}

/** A quiet title-row control; explanations belong to its two-line menu items. */
export function AssistantMode() {
  const state = useContext(ModeContext);
  const { AUTONOMY_TEXT: T } = useMessages();
  const [open, setOpen] = useState(false);
  const hovered = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelClose = () => { clearTimeout(closeTimer.current); };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const closeAfterLeave = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => { setOpen(false); }, 180);
  };
  if (!state) return null;
  return <DropdownMenu modal={false} open={open} onOpenChange={value => { cancelClose(); setOpen(value); }}>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="md" disabled={state.disabled}
        aria-label={`${T.modeLabel}: ${T.modes[state.selected]}`} data-assistant-mode
        className="group ml-auto min-w-0 shrink px-xs text-body-small font-normal text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        onPointerEnter={event => {
          cancelClose();
          if (event.pointerType === "mouse" && !state.disabled) { hovered.current = true; setOpen(true); }
        }}
        onPointerLeave={() => { if (hovered.current) closeAfterLeave(); }}
        onKeyDown={() => { hovered.current = false; cancelClose(); }}>
        <span className="truncate">{T.modes[state.selected]}</span>
        <Icon name="chevron-down" size="xs" className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" width="sm" className="max-w-[calc(100vw-var(--space-lg))]" aria-label={T.modeLabel}
      onPointerEnter={cancelClose} onPointerLeave={() => { if (hovered.current) closeAfterLeave(); }}
      onKeyDown={() => { hovered.current = false; cancelClose(); }}
      onEscapeKeyDown={event => event.stopPropagation()}
      onCloseAutoFocus={event => { if (hovered.current) event.preventDefault(); }}>
      <DropdownMenuRadioGroup value={state.selected} onValueChange={state.change}>
        {["autonomous", "ask_high_risk", "ask_always"].map(value => <DropdownMenuRadioItem key={value} value={value} disabled={state.disabled}
          className="py-sm data-[state=checked]:bg-accent">
          <span className="flex min-w-0 flex-col gap-2xs">
            <span className="text-label text-foreground">{T.modes[value]}</span>
            <span className="text-body-small leading-snug text-muted-foreground">{T.modeSummary[value]}</span>
          </span>
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
