"use client";

import { useState, type ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@vxture/design-ui";
import { AssistantPanel } from "./assistant-panel";
import { XiaoyuSurface } from "./xiaoyu-workspace";
import { useXiaoyu } from "./xiaoyu-provider";
import { usePageAssistantAvailable } from "./form-assist-slot";
import { workspaceHref } from "../lib/xiaoyu-client";
import { useMessages } from "../lib/i18n/provider";

export function XiaoyuDock({ children, ...frame }: Omit<ComponentProps<typeof AssistantPanel>, "workbenchHref">) {
  const { XIAOYU_TEXT: T } = useMessages();
  const { bundle } = useXiaoyu();
  const pathname = usePathname();
  const pageAssist = usePageAssistantAvailable();
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  // A new route always returns to the shared task. The legacy page assistant
  // stays mounted, retaining its portal/draft without a second active input.
  const pageActive = !frame.fullscreen && selectedPage === pathname;
  return <AssistantPanel {...frame} workbenchHref={workspaceHref(bundle?.task.id)}>
    {!frame.fullscreen ? <div role="group" aria-label={T.dock} className="mb-md flex shrink-0 flex-wrap gap-xs">
      <Button size="md" variant={pageActive ? "ghost" : "secondary"} aria-pressed={!pageActive} onClick={() => setSelectedPage(null)}>{T.conversation}</Button>
      <Button size="md" variant={pageActive ? "secondary" : "ghost"} aria-pressed={pageActive} onClick={() => setSelectedPage(pathname)}>{pageAssist ? T.pageAssist : T.pageTools}</Button>
    </div> : null}
    <div className={pageActive ? "hidden" : "flex min-h-0 flex-1 flex-col"} hidden={pageActive} inert={pageActive}><XiaoyuSurface full={frame.fullscreen} onNavigate={frame.fullscreen ? frame.onToggleFullscreen : undefined} /></div>
    <div className={pageActive ? "flex min-h-0 flex-1 flex-col gap-sm" : "hidden"} hidden={!pageActive} inert={!pageActive} data-xiaoyu-page-tools>
      <p className="shrink-0 text-body-small text-muted-foreground">{T.legacyPageHint}</p>
      {children}
    </div>
  </AssistantPanel>;
}
