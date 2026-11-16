"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { ArrowsInLineHorizontal, ArrowsInSimple, ArrowsOutLineHorizontal, ArrowsOutSimple } from "@phosphor-icons/react";
import { Button, Icon, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AssistantMode } from "./assistant-mode";
import { AssistantInteractionProvider } from "./assistant-interaction";

export function AssistantPanel({ children, wide, fullscreen, onToggleWidth, onToggleFullscreen, onClose, workbenchHref }: {
  readonly children: ReactNode;
  readonly wide: boolean;
  readonly fullscreen: boolean;
  readonly onToggleWidth: () => void;
  readonly onToggleFullscreen: () => void;
  readonly onClose: () => void;
  readonly workbenchHref?: string;
}) {
  const { BOARD_TEXT: B, ASSISTANT_PANEL_TEXT: T, DOMAIN_LABEL, HEADER_TEXT } = useMessages();
  const frame = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const close = () => {
    if (frame.current?.querySelector('[aria-busy="true"]')) toast({ tone: "info", title: T.continuesWhenClosed });
    onClose();
  };
  const WidthIcon = wide ? ArrowsInLineHorizontal : ArrowsOutLineHorizontal;
  const FullscreenIcon = fullscreen ? ArrowsInSimple : ArrowsOutSimple;
  return <AssistantInteractionProvider><div ref={frame} className="flex h-full min-h-0 w-full flex-col gap-md" data-assistant-frame>
    <div className="flex shrink-0 items-center gap-xs" data-assistant-header>
      <div className="flex min-w-0 items-center gap-2xs">
        <Icon name="sparkles" size="sm" className="shrink-0 text-primary" />
        <h2 className="min-w-0 truncate text-label" title={B.agent}>{B.agent}</h2>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2xs" role="group" aria-label={T.controls}>
        <Button type="button" variant="ghost" size="icon-xl" aria-label={wide ? T.narrow : T.wide}
          title={wide ? T.narrow : T.wide} aria-pressed={wide} data-assistant-width-toggle onClick={onToggleWidth}>
          <WidthIcon size={16} weight="regular" aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon-xl" aria-label={fullscreen ? HEADER_TEXT.fullscreenExit : HEADER_TEXT.fullscreen}
          title={fullscreen ? HEADER_TEXT.fullscreenExit : HEADER_TEXT.fullscreen} aria-pressed={fullscreen}
          data-assistant-fullscreen-toggle onClick={onToggleFullscreen}>
          <FullscreenIcon size={16} weight="regular" aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon-xl" aria-label={T.close} title={T.close}
          data-assistant-close onClick={close}><Icon name="x" size="sm" /></Button>
      </div>
    </div>
    <div className="mx-auto flex min-h-0 w-full max-w-[55rem] flex-1 flex-col overflow-hidden" data-assistant-body>{children}</div>
    <div className="flex shrink-0 items-center justify-between gap-xs border-t border-border pt-xs" data-assistant-footer>
      <AssistantMode />
      {workbenchHref ? <Button asChild size="md" variant="ghost" className="text-muted-foreground">
        <Link href={workbenchHref} target="_blank" rel="noopener noreferrer" data-assistant-workbench>
          <Icon name="squares-four" size="sm" />{DOMAIN_LABEL.copilot}<Icon name="external-link" size="xs" />
        </Link>
      </Button> : null}
    </div>
  </div></AssistantInteractionProvider>;
}
