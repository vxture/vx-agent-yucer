"use client";

import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
import type { ReactNode } from "react";
import styles from "./planning-module-summary.module.css";

export type BusinessSummaryItem = {
  readonly label: string;
  readonly value?: ReactNode;
  readonly suffix?: string;
  readonly hint: string;
  readonly attention?: boolean;
  readonly href?: string;
  readonly onSelect?: () => void;
};

/** Inline business figures use the same DS bindings as the strategy summary. */
export function BusinessSummary({ kind, items }: {
  readonly kind: string;
  readonly items: readonly BusinessSummaryItem[];
}) {
  return <span className={styles.summary} data-deployment-summary={kind}>
    {items.map(item => <span key={item.label}>
      {item.label}{item.value !== undefined ? <> <SummaryFigure item={item}/></> : null}
      {item.suffix ? <> {item.suffix}</> : null}
    </span>)}
  </span>;
}

function SummaryFigure({ item }: { readonly item: BusinessSummaryItem }) {
  const className = `${styles.figure} ${item.href || item.onSelect ? styles.action : ""} ${item.attention ? "bg-warning-muted text-foreground" : "bg-info-muted-hover text-foreground"}`;
  const label = [item.label, typeof item.value === "string" || typeof item.value === "number" ? item.value : null, item.suffix].filter(value => value !== null && value !== undefined).join(" ");
  let trigger: ReactNode;
  if (item.href) trigger = <TooltipTrigger asChild><Link className={className} aria-label={label} href={item.href}>{item.value}</Link></TooltipTrigger>;
  else if (item.onSelect) trigger = <TooltipTrigger type="button" className={className} data-control-size="preserve" aria-label={label} onClick={item.onSelect}>{item.value}</TooltipTrigger>;
  else trigger = <TooltipTrigger type="button" className={className} data-control-size="preserve" aria-label={label}>{item.value}</TooltipTrigger>;
  return <Tooltip>{trigger}<TooltipContent className={styles.tooltip}>{item.hint}</TooltipContent></Tooltip>;
}
