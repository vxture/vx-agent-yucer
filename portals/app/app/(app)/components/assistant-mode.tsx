"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { changeAutonomy } from "../copilot/actions";

export function AssistantMode({ mode, canChange }: { readonly mode: string; readonly canChange: boolean }) {
  const { AUTONOMY_TEXT, AUTONOMY_ERROR } = useMessages();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState(mode);
  useEffect(() => { setSelected(mode); }, [mode]);
  const { toast } = useToast();
  const router = useRouter();
  return <div className="shrink-0 space-y-xs border-b border-border pb-sm">
    <label htmlFor="assistant-mode" className="text-label">{AUTONOMY_TEXT.modeLabel}</label>
    <Select value={selected} disabled={!canChange || pending} onValueChange={(value) => {
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
    }}>
      <SelectTrigger id="assistant-mode" className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {["autonomous", "ask_high_risk", "ask_always"].map((value) => <SelectItem key={value} value={value}>{AUTONOMY_TEXT.modes[value]}</SelectItem>)}
      </SelectContent>
    </Select>
    <p className="text-body-small text-muted-foreground">{AUTONOMY_TEXT.modeWhy[selected]}</p>
  </div>;
}
