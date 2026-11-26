"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
import type { ReactNode } from "react";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { marketModuleSummary, productModuleSummary, solutionModuleSummary, strategyModuleSummary } from "../lib/planning-module-summary";
import styles from "./planning-module-summary.module.css";

function Figure({ children, hint, attention = false }: { readonly children: ReactNode; readonly hint: string; readonly attention?: boolean }) {
  return <Tooltip><TooltipTrigger className={`${styles.figure} ${attention ? "bg-warning-muted text-foreground" : "bg-info-muted-hover text-foreground"}`} data-control-size="preserve">
    {children}
  </TooltipTrigger><TooltipContent className={styles.tooltip}>{hint}</TooltipContent></Tooltip>;
}

function ratioValue(total: number, value: number | null, empty: string, unknown: string, locale: string) {
  if (total === 0) return empty;
  if (value === null) return unknown;
  return `${value.toLocaleString(locale)}/${total.toLocaleString(locale)}`;
}

export function StrategyModuleSummary(props: { readonly plans: Parameters<typeof strategyModuleSummary>[0]; readonly period: string; readonly adoption: Parameters<typeof strategyModuleSummary>[2] }) {
  const { PLANNING_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  const s = strategyModuleSummary(props.plans, props.period, props.adoption);
  if (!s) return <span data-planning-summary="strategy">{T.sourceUnavailable}</span>;
  return <span className={styles.summary} data-planning-summary="strategy">
    <span>{T.strategyLead} <Figure hint={T.strategyHint}>{s.active.toLocaleString(locale)}</Figure> {T.strategyUnit}{T.comma}</span>{" "}
    <span>{T.adoptionLead} <Figure hint={T.adoptionHint}>{ratioValue(s.published, s.accepted, T.noPublished, T.unknown, locale)}</Figure>{T.comma}</span>{" "}
    <span><Figure hint={T.draftHint} attention={s.draft > 0}>{s.draft.toLocaleString(locale)}</Figure> {T.draftTail}</span>
  </span>;
}

export function MarketModuleSummary({ markets }: { readonly markets: Parameters<typeof marketModuleSummary>[0] }) {
  const { PLANNING_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  const s = marketModuleSummary(markets);
  if (!s) return <span data-planning-summary="segment">{T.sourceUnavailable}</span>;
  return <span className={styles.summary} data-planning-summary="segment">
    <span>{T.marketLead} <Figure hint={T.marketHint}>{s.active.toLocaleString(locale)}</Figure> {T.marketUnit}{T.comma}</span>{" "}
    <span>{T.matchedLead} <Figure hint={T.matchedHint}>{s.matched === null ? T.unknown : s.matched.toLocaleString(locale)}</Figure> {s.matched !== null && T.customerUnit}{T.comma}</span>{" "}
    <span><Figure hint={T.offeringHint} attention={s.withoutOfferings > 0}>{s.withoutOfferings.toLocaleString(locale)}</Figure> {T.offeringTail}</span>
  </span>;
}

export function SolutionModuleSummary({ input }: { readonly input: Parameters<typeof solutionModuleSummary> }) {
  const { PLANNING_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  const s = solutionModuleSummary(...input);
  if (!s) return <span data-planning-summary="solution">{T.sourceUnavailable}</span>;
  return <span className={styles.summary} data-planning-summary="solution">
    <span>{T.solutionLead} <Figure hint={T.solutionHint}>{s.active.toLocaleString(locale)}</Figure> {T.solutionUnit}{T.comma}</span>{" "}
    <span>{T.productCoverLead} <Figure hint={T.productCoverHint}>{s.covered.toLocaleString(locale)}</Figure> {T.productUnit}{T.comma}</span>{" "}
    {s.unready === null
      ? <span>{T.quoteUnknownLead} <Figure hint={T.quoteHint}>{T.unknown}</Figure></span>
      : <span><Figure hint={T.quoteHint} attention={s.unready > 0}>{s.unready.toLocaleString(locale)}</Figure> {T.quoteTail}</span>}
  </span>;
}

export function ProductModuleSummary({ input }: { readonly input: Parameters<typeof productModuleSummary> }) {
  const { PLANNING_SUMMARY_TEXT: T } = useMessages(), locale = useLocale();
  const s = productModuleSummary(...input);
  if (!s) return <span data-planning-summary="catalog">{T.sourceUnavailable}</span>;
  return <span className={styles.summary} data-planning-summary="catalog">
    <span>{T.productLead} <Figure hint={T.productHint}>{s.active.toLocaleString(locale)}</Figure> {T.productUnit}{T.comma}</span>{" "}
    <span>{T.pricingLead} <Figure hint={T.pricingHint} attention={s.priced !== null && s.priced < s.active}>{ratioValue(s.active, s.priced, T.noActive, T.unknown, locale)}</Figure>{T.comma}</span>{" "}
    <span><Figure hint={T.developmentHint}>{s.development.toLocaleString(locale)}</Figure> {T.developmentTail}</span>
  </span>;
}
