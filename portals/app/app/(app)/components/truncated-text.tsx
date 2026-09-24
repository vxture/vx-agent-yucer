"use client";

import { useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";

// Text that may be cut (truncate / line-clamp), with the whole of it in a DS
// tooltip - but ONLY when it actually is cut (owner, 2026-09-24: 信息存在
// 检查, 应该提供 tooltip). A native `title` shows up late, unstyled, and on
// text that fits too.
//
// MEASURED AT HOVER, not at mount: the first version measured once on mount
// and never attached - layout (fonts, the panel's own open animation) had not
// settled yet, and a ResizeObserver cannot help afterwards because text that
// overflows never changes the element's box. Checking scroll size against
// client size at the moment the tooltip wants to open is always current.

export function TruncatedText({
  text,
  className,
}: {
  readonly text: string;
  /** Must include the truncation itself: `truncate` or `line-clamp-N`. */
  readonly className: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const isCut = () => {
    const el = ref.current;
    return !!el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  };
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isCut())}>
      <TooltipTrigger asChild>
        <span ref={ref} className={className}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[24rem]">{text}</TooltipContent>
    </Tooltip>
  );
}
