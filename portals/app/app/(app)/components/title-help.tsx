"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, Drawer, Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

/** Optional business guidance, available from the title it explains. */
export function TitleHelp({ topic, children }: { readonly topic?: string; readonly children: ReactNode }) {
  const { HEADER_TEXT: T } = useMessages();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!children) return null;
  const label = topic ? `${topic} \u00b7 ${T.help}` : T.help;
  return <>
    <Button ref={trigger} type="button" size="icon-md" variant="ghost" className="text-muted-foreground"
      aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={label}
      data-title-help onClick={() => setOpen(true)}>
      <Icon name="help" size="sm" />
    </Button>
    <Drawer open={open} onClose={() => {
      setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus());
    }} width="md" className="max-w-full" title={label} closeLabel={T.close}>
      <div className="flex flex-col gap-md text-body leading-relaxed" data-title-help-content>{children}</div>
    </Drawer>
  </>;
}
