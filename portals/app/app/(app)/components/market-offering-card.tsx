"use client";

import Link from "next/link";
import { StrategyInfoCard as Card, StrategyInfoContent as CardContent } from "./strategy-info-card";
import type { ReactNode } from "react";
import { Button, Icon, type IconName } from "@vxture/design-ui";
import styles from "./market-offering-card.module.css";
import links from "./business-reference.module.css";
import { useLocale, useMessages } from "../lib/i18n/provider";

/** The date must come from publication history, never a creation/price fallback. */
export function LibraryCardPublishedDate({ date }: { readonly date: Date | string | null }) {
  const { CATALOG_TEXT: T } = useMessages();
  const locale = useLocale();
  const recorded = date instanceof Date ? date : date ? new Date(date) : null;
  const valid = recorded && Number.isFinite(recorded.getTime()) ? recorded : null;
  const label = valid ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Shanghai" }).format(valid) : T.publishedDateUnknown;
  return <span className={styles.number} title={valid ? `${T.publishedDate}: ${label}` : T.publishedDateUnknownHint} aria-label={`${T.publishedDate}: ${label}`}>
    <Icon name="calendar" size="sm" className="shrink-0" aria-hidden="true"/>
    {valid ? <time dateTime={valid.toISOString()}>{label}</time> : <span>{label}</span>}
  </span>;
}

export function LibraryCardHeader({ name, number, icon, color = "text-primary-text", tags, metadata, status, actions, href, onOpen }: {
  readonly name: string;
  readonly number: string;
  readonly icon: IconName;
  readonly color?: string;
  readonly tags?: ReactNode;
  readonly metadata?: ReactNode;
  readonly status: ReactNode;
  readonly actions: ReactNode;
  readonly href?: string;
  readonly onOpen?: () => void;
}) {
  const title = <><Icon name={icon} size="lg" className={`${styles.emblem} ${href || onOpen ? "" : color}`} aria-hidden="true" /><span className="min-w-0 break-words">{name}</span></>;
  return <div className={styles.header}>
    <div className={styles.identity}>
      <div className={styles.titleRow}><h3 className="flex min-w-0 text-heading-1 leading-snug text-foreground">{href ? <Link href={href} title={name} className={`${styles.titleLink} ${links.link}`}>{title}</Link>
        : onOpen ? <Button type="button" size="md" variant="ghost" data-control-size="preserve" className={`${styles.titleLink} ${links.link} h-auto min-h-0 max-w-full border-0 justify-start whitespace-normal p-0 text-left text-heading-1 leading-snug hover:bg-transparent`} onClick={onOpen}>{title}</Button>
        : <span className={styles.titleLink}>{title}</span>}</h3>{tags}</div>
      <div className={`${styles.metadata} text-body-small`}>
        <span className={styles.number}><Icon name="file-text" size="sm" className="shrink-0" aria-hidden="true" /><span>{number}</span></span>
        {metadata}
      </div>
    </div>
    <div className={styles.headerActions}>{status}{actions}</div>
  </div>;
}

export function LibraryCardField({ icon, label, children }: {
  readonly icon: IconName;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return <div className={styles.field}>
    <span className={styles.label}><Icon name={icon} size="sm" className="shrink-0" aria-hidden="true" /><span>{label}</span></span>
    <div className={styles.value}>{children}</div>
  </div>;
}

/** A quieter companion to the strategy charter, shared by both library views. */
export function MarketOfferingCard({ kind, name, number, titleTags, metadata, status, actions, summary, context, facts, onOpen, href }: {
  readonly kind: "market" | "solution";
  readonly name: string;
  readonly number: string;
  readonly titleTags?: ReactNode;
  readonly metadata?: ReactNode;
  readonly status: ReactNode;
  readonly actions: ReactNode;
  readonly summary: ReactNode;
  readonly context: ReactNode;
  readonly facts: ReactNode;
  readonly onOpen?: () => void;
  readonly href?: string;
}) {
  const icon: IconName = kind === "market" ? "target" : "stack";
  const color = kind === "market" ? "text-info-text" : "text-primary-text";
  return <Card variant="overview" surface="soft" className={`${styles.card} ${color}`} data-market-offering-card={kind}>
    <div className={styles.art} aria-hidden="true" style={{ maskImage: `url(/assets/strategy/${kind}-library.svg)` }} />
    <CardContent className={`${styles.content} text-foreground`}>
      <LibraryCardHeader name={name} number={number} icon={icon} color={color} tags={titleTags} metadata={metadata} status={status} actions={actions} href={href} onOpen={onOpen}/>
      <div className={styles.body}>
        <div className={styles.fields}>{summary}{kind === "market" ? context : facts}</div>
        <div className={styles.metrics}>{kind === "market" ? facts : context}</div>
      </div>
    </CardContent>
  </Card>;
}

export function LibraryCardFact({ icon, label, children }: {
  readonly icon: IconName; readonly label: string; readonly children: ReactNode;
}) {
  return <span className={styles.fact}>
    <span className={styles.label}><Icon name={icon} size="sm" className="shrink-0" aria-hidden="true" /><span>{label}</span></span><span className={`${styles.factValue} font-medium`}>{children}</span>
  </span>;
}
