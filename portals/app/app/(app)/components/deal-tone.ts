// The deal page's row tones (YC-072 prototype: .chk / .action / .cell) - a
// coloured left edge and a coloured result word. NAMED CUSTOM STYLE (owner,
// 2026-09-24: own styles where the DS has no knob): the DS has no edge-toned
// row; these are its own colour tokens, the same ones delivery-plan-flow.tsx
// already uses for the same shape.

export type RowTone = "good" | "warn" | "bad" | "none";

export const ROW_EDGE: Record<RowTone, string> = {
  good: "border-l-(color:--success-text)",
  warn: "border-l-(color:--warning-text)",
  bad: "border-l-destructive",
  none: "border-l-border",
};

export const ROW_TEXT: Record<RowTone, string> = {
  good: "text-(color:--success-text)",
  warn: "text-(color:--warning-text)",
  bad: "text-destructive-text",
  none: "text-muted-foreground",
};

/** An edge-toned row on the sunken surface (.chk). */
export const TONED_ROW = "bg-muted/40 rounded-r-md border-l-[3px] px-sm py-xs";

/** The small grey source chip (.src): 规则判断 / 智能分析. */
export const SOURCE_CHIP =
  "bg-muted text-muted-foreground inline-flex min-w-[4.75rem] flex-none items-center justify-center rounded-full px-xs text-[11px] font-semibold";
export const SOURCE_CHIP_MODEL =
  "bg-primary/10 text-primary inline-flex min-w-[4.75rem] flex-none items-center justify-center rounded-full px-xs text-[11px] font-semibold";
