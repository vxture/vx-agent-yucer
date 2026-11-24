"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Measure the DS-owned width, so animated wrappers never duplicate its sizes. */
export function useDockSize(ref: RefObject<HTMLDivElement | null>, enabled = true) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const frame = ref.current;
    const dock = frame?.querySelector<HTMLElement>(":scope > aside, :scope > [data-slot=shell-sidebar-frame]");
    if (!frame || !dock) return;
    const measure = () => {
      if (frame.dataset.assistantFullscreen === "true") return;
      frame.style.setProperty("--yucer-dock-size", `${dock.getBoundingClientRect().width}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [ref, enabled]);
}
