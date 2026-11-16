"use client";

import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { Robot } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, Icon, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { changeAutonomy } from "../copilot/actions";

interface ModeState {
  readonly selected: string;
  readonly disabled: boolean;
  readonly reason?: string;
  readonly change: (value: string) => void;
}
const ModeContext = createContext<ModeState | null>(null);

/** Shared above the shell so form-owned portals see the same authority state. */
export function AssistantModeProvider({ mode, canChange, reason, children }: {
  readonly mode?: string;
  readonly canChange: boolean;
  readonly reason?: string;
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
  return <ModeContext.Provider value={mode ? { selected, disabled: !canChange || pending, reason: pending ? AUTONOMY_TEXT.saving : reason ? AUTONOMY_ERROR[reason] ?? AUTONOMY_ERROR.denied : undefined, change } : null}>{children}</ModeContext.Provider>;
}

/** The footer remains inspectable even when a member cannot change authority. */
export function AssistantMode() {
  const state = useContext(ModeContext);
  const { AUTONOMY_TEXT: T } = useMessages();
  const [open, setOpen] = useState(false);
  if (!state) return null;
  const icons = { ask_always: "list-checks", ask_high_risk: "target", autonomous: "agent" } as const;
  const iconOf = (value: string) => icons[value as keyof typeof icons] ?? "list-checks";
  return <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="md"
        aria-label={`${T.modeLabel}: ${T.modes[state.selected]}`} data-assistant-mode
        className="min-w-0 gap-xs px-xs text-body-small font-normal text-muted-foreground">
        {state.selected === "autonomous" ? <Robot size={16} aria-hidden="true" /> : <Icon name={iconOf(state.selected)} size="sm" />}
        <span>{T.modes[state.selected]}</span><Icon name="chevron-up" size="xs" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" width="sm" className="max-w-[calc(100vw-var(--space-lg))]" aria-label={T.modeLabel}
      onEscapeKeyDown={event => event.stopPropagation()}>
      <DropdownMenuRadioGroup value={state.selected} onValueChange={state.change}>
        {["ask_always", "ask_high_risk", "autonomous"].map(value => <DropdownMenuRadioItem key={value} value={value} disabled={state.disabled}
          className="gap-sm py-sm data-[state=checked]:bg-accent">
          {value === "autonomous" ? <Robot size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" /> : <Icon name={iconOf(value)} size="sm" className="shrink-0 text-muted-foreground" />}
          <span className="flex min-w-0 flex-col gap-2xs">
            <span className="text-label text-foreground">{T.modes[value]}</span>
            <span className="text-body-small leading-snug text-muted-foreground">{T.modeSummary[value]}</span>
          </span>
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <p className="px-sm py-xs text-body-small text-muted-foreground">{T.dangerHint}</p>
      {state.reason ? <p role="status" className="px-sm pb-xs text-body-small text-muted-foreground">{state.reason}</p> : null}
    </DropdownMenuContent>
  </DropdownMenu>;
}
