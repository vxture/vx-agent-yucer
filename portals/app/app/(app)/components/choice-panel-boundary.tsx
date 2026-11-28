"use client";

import { useEffect, type ReactNode } from "react";

/** Keep the innermost native picker ahead of enclosing DS overlay handlers. */
export function ChoicePanelBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!CSS.supports("appearance", "base-select")) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.querySelector("select:open")) {
        // Let the browser close its picker, without dismissing the parent.
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
  return children;
}
