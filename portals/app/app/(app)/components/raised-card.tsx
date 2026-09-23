import type { ReactNode } from "react";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";

// The page's one card surface (lib/card-veil.ts), as a wrapper for a block
// that renders a plain DS Section of its own - the deal page's chain, roles,
// lines, terms, stage control and journey sat bare on the page background
// between cards (polish, owner 2026-09-24: 全部优化修改, own CSS allowed where
// the DS has no knob: these components take no tone prop from their callers).
export function RaisedCard({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={[CARD_VEIL_CLASS, "flex flex-col gap-lg", className].filter(Boolean).join(" ")} style={CARD_VEIL_STYLE}>
      {children}
    </div>
  );
}
