"use client";

import { useState, type ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { Button, Icon } from "@vxture/design-ui";
import { AssistantPanel, AssistantPanelControls } from "./assistant-panel";
import { XiaoyuSurface } from "./xiaoyu-workspace";
import { usePageAssistantAvailable } from "./form-assist-slot";
import { useMessages } from "../lib/i18n/provider";

export function XiaoyuDock({ children, ...frame }: ComponentProps<typeof AssistantPanel>) {
  const { XIAOYU_TEXT: T } = useMessages();
  const pathname = usePathname();
  const pageAssist = usePageAssistantAvailable();
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  // A new route always returns to the shared task. The legacy page assistant
  // stays mounted, retaining its portal/draft without a second active input.
  const pageActive = !frame.fullscreen && selectedPage === pathname;
  return <AssistantPanel {...frame}>
    <div className={pageActive ? "hidden" : "flex min-h-0 flex-1 flex-col"} hidden={pageActive} inert={pageActive}>
      <XiaoyuSurface full={frame.fullscreen} controls={<AssistantPanelControls {...frame} />}
        pageTools={{ label: pageAssist ? T.pageAssist : T.pageTools, open: () => setSelectedPage(pathname) }} />
    </div>
    <div className={pageActive ? "flex min-h-0 flex-1 flex-col gap-sm" : "hidden"} hidden={!pageActive} inert={!pageActive} data-xiaoyu-page-tools>
      <header className="flex h-header-lg shrink-0 items-center gap-xs border-b border-border px-md" data-assistant-header>
        <Button variant="ghost" size="md" onClick={() => setSelectedPage(null)}><Icon name="arrow-left" size="sm" />{T.name}</Button>
        <span className="ml-auto"><AssistantPanelControls {...frame} /></span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-hidden px-md pb-md">
        <p className="shrink-0 text-body-small text-muted-foreground">{T.legacyPageHint}</p>
        {children}
      </div>
    </div>
  </AssistantPanel>;
}
