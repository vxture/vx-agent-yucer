"use client";

import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@vxture/design-ui";
import { useLocale } from "../lib/i18n/provider";

export function StrategyQuantity({ value, unit }: { readonly value: ReactNode; readonly unit?: string }) {
  return <span className="inline-flex max-w-full items-baseline gap-xs align-top tabular-nums"><span className="min-w-0 break-words">{value}</span>{unit ? <span className="shrink-0 text-body-small font-normal text-muted-foreground" data-quantity-unit>{unit}</span> : null}</span>;
}

// Read-only field punctuation; section and table headings stay unpunctuated.
export function StrategyDetailLabel({ children, icon }: {
  readonly children: ReactNode;
  readonly icon?: ComponentProps<typeof Icon>["name"];
}) {
  const locale = useLocale();
  return <span className="inline-flex items-center gap-xs whitespace-nowrap align-top text-body font-normal text-muted-foreground" data-strategy-detail-label>
    {icon ? <Icon name={icon} size="xs" aria-hidden="true"/> : null}
    <span>{children}{locale.startsWith("zh") ? "\uFF1A" : ":"}</span>
  </span>;
}
