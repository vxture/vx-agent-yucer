"use client";
import type { FocusCoverage, FocusRow } from "../../domains/planning/focus-model";
import { focusNeedsAttention } from "../../domains/planning/focus-attention";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { Tag } from "../components/tag";

export function RevenueValue({ row }: Readonly<{ row: FocusRow }>) {
  const { FOCUS_TEXT: T } = useMessages(), locale = useLocale();
  if (!row.revenue.length) return <span className="text-warning-text">{T.targetMissing}</span>;
  return <span className="inline-flex flex-wrap gap-sm">{row.revenue.map(m => <span key={m.currency} className="whitespace-nowrap tabular-nums">{Number(m.amount).toLocaleString(locale)} <span className="text-body-small text-muted-foreground">{m.currency}</span></span>)}</span>;
}

export function KeyCoverage({ coverage: c }: Readonly<{ coverage: FocusCoverage }>) {
  const { FOCUS_TEXT: T } = useMessages();
  if (c.state !== "ready") return <SourceState state={c.state}/>;
  if (!c.coveredRoles) return <span className="inline-flex flex-wrap gap-xs text-warning-text">{c.requiredRoles ? <span className="tabular-nums">0/{c.requiredRoles} <span className="text-muted-foreground">{T.roleUnit}</span></span> : null}<span>{T.notCovered}</span></span>;
  return <span className="inline-flex flex-wrap items-center gap-xs tabular-nums"><span>{c.coveredRoles}/{c.requiredRoles} <span className="text-muted-foreground">{T.roleUnit}</span></span><span className="text-muted-foreground">/ {c.keyPeople} {T.peopleUnit}</span>{c.coveredRoles < c.requiredRoles ? <Tag tone="warning">{T.partialCoverage}</Tag> : null}</span>;
}

export function DecisionChains({ coverage: c }: Readonly<{ coverage: FocusCoverage }>) {
  const { FOCUS_TEXT: T } = useMessages();
  if (c.state !== "ready") return <SourceState state={c.state}/>;
  return <span className="inline-flex flex-wrap items-center gap-xs tabular-nums"><span>{c.chains} <span className="text-muted-foreground">{T.chainUnit}</span></span>{c.chains ? <span className={c.completeChains < c.totalChains ? "text-warning-text" : "text-muted-foreground"}>{T.completeChains(c.completeChains, c.totalChains)}</span> : <span className="text-warning-text">{T.noChain}</span>}</span>;
}

function SourceState({ state }: Readonly<{ state: "denied" | "unavailable" }>) {
  const { FOCUS_TEXT: T } = useMessages();
  return <span className="text-muted-foreground">{state === "denied" ? T.coverageDenied : T.coverageUnavailable}</span>;
}

export function CoverageAttention({ row }: Readonly<{ row: FocusRow }>) {
  const { FOCUS_TEXT: T } = useMessages(), c = row.coverage;
  if (c.state !== "ready" && row.revenue.length) return <SourceState state={c.state}/>;
  const unreachable = c.state === "ready" && c.chains > 0 && c.unreachableChains > 0;
  return <span className="flex flex-wrap items-center gap-xs"><Tag tone={focusNeedsAttention(row) ? "warning" : "success"}>{focusNeedsAttention(row) ? T.needsAttention : T.covered}</Tag>{unreachable ? <Tag tone="warning">{T.buyerGap}</Tag> : null}</span>;
}
