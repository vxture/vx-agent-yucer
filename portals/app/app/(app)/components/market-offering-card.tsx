"use client";

import Link from "next/link";
import { StrategyInfoCard as Card, StrategyInfoContent as CardContent } from "./strategy-info-card";
import type { ReactNode } from "react";
import { Button, Icon, type IconName } from "@vxture/design-ui";
import layout from "./strategy-info-card.module.css";
import styles from "./market-offering-card.module.css";

/** A quieter companion to the strategy charter, shared by both library views. */
export function MarketOfferingCard({ kind, name, number, description, status, actions, summary, context, facts, openLabel, onOpen, href }: {
  readonly kind: "market" | "solution";
  readonly name: string;
  readonly number: string;
  readonly description?: ReactNode;
  readonly status: ReactNode;
  readonly actions: ReactNode;
  readonly summary: ReactNode;
  readonly context: ReactNode;
  readonly facts: ReactNode;
  readonly openLabel: string;
  readonly onOpen?: () => void;
  readonly href?: string;
}) {
  const icon: IconName = kind === "market" ? "target" : "stack";
  const color = kind === "market" ? "text-info-text" : "text-primary-text";
  return <Card variant="overview" surface="soft" className={`${styles.card} ${color}`} data-market-offering-card={kind}>
    <div className={styles.art} aria-hidden="true" style={{ maskImage: `url(/assets/strategy/${kind}-library.svg)` }} />
    <CardContent className="flex min-w-0 flex-col gap-md text-foreground">
      <div className={styles.header}>
        <Icon name={icon} size="lg" className={`shrink-0 ${color}`} aria-hidden="true" />
        <div className="min-w-0">
          <h3>{href ? <Link href={href} title={name} className={`${kind === "market" ? "line-clamp-2 " : ""}break-words text-heading-2 no-underline transition-colors hover:text-primary-text hover:no-underline`}>{name}</Link> : <Button type="button" size="md" variant="ghost" className="h-auto min-h-0 max-w-full justify-start whitespace-normal p-0 text-left text-foreground hover:bg-transparent hover:text-primary-text" onClick={onOpen}><span className="break-words text-heading-2">{name}</span></Button>}</h3>
          <p className="break-words text-body-small tabular-nums text-muted-foreground">{number}</p>
          {description ? <p className="mt-sm line-clamp-2 min-w-0 break-words text-body text-muted-foreground" data-market-card-description>{description}</p> : null}
        </div>
        <div className="flex items-center gap-sm">{status}{actions}</div>
      </div>
      <div className={`${styles.body} ${kind === "market" ? styles.marketBody : ""}`}>
        <div className="flex min-w-0 flex-col gap-md">{summary}</div>
        <div className="flex min-w-0 flex-col gap-md">{context}</div>
      </div>
      <div className={`flex flex-wrap items-center justify-between gap-sm ${layout.divider}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-xl gap-y-xs">{facts}</div>
        <Button size="md" variant="ghost" onClick={href ? undefined : onOpen} asChild={!!href}>{href ? <Link href={href}>{openLabel}<Icon name="arrow-right" size="sm" aria-hidden="true" /></Link> : <>{openLabel}<Icon name="arrow-right" size="sm" aria-hidden="true" /></>}</Button>
      </div>
    </CardContent>
  </Card>;
}

export function LibraryCardFact({ icon, label, children }: {
  readonly icon: IconName; readonly label: string; readonly children: ReactNode;
}) {
  return <span className="inline-flex min-w-0 flex-wrap items-center gap-xs text-body-small text-muted-foreground">
    <Icon name={icon} size="sm" aria-hidden="true" />{label}<span className="text-body font-medium tabular-nums text-foreground">{children}</span>
  </span>;
}
