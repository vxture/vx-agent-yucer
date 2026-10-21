// TD-034: PanelCard has no collapsed/divider API. Target only a body whose
// direct CollapsibleContent is closed; nested disclosures do not collapse it.
// Remove when the DS provides a native collapsed PanelCard state.
export const COLLAPSED_PANEL_CLASS =
  "[&:has(>div:last-child>[data-state=closed])]:gap-0 [&:has(>div:last-child>[data-state=closed])>div:first-child>div]:border-b-0 [&:has(>div:last-child>[data-state=closed])>div:first-child>div]:pb-0 [&:has(>div:last-child>[data-state=closed])>div:last-child]:hidden";
