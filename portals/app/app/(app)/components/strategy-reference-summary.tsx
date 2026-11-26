"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger, Icon, type IconName } from "@vxture/design-ui";
import styles from "./strategy-charter-card.module.css";

export type StrategyReference = { id: string; name: string; href?: string; icon?: IconName };

function ReferenceContent({ row }: { readonly row: StrategyReference }) {
  return <>{row.icon ? <Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/> : null}<span>{row.name}</span></>;
}

function Reference({ row }: { readonly row: StrategyReference }) {
  const className = `${styles.referenceItem} transition-colors hover:text-primary-text focus-visible:text-primary-text`;
  return row.href ? <Link href={row.href} className={className} title={row.name}><ReferenceContent row={row}/></Link>
    : <span className={styles.referenceItem} title={row.name}><ReferenceContent row={row}/></span>;
}

/** Fit complete references into one line, keeping overflow discoverable on every width. */
export function StrategyReferenceSummary({ rows, label, href, kind }: {
  readonly rows: readonly StrategyReference[]; readonly label: string; readonly href: string;
  readonly kind: string;
}) {
  const root = useRef<HTMLDivElement>(null), measure = useRef<HTMLDivElement>(null), more = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(1);
  const identity = rows.map(r => `${r.id}:${r.name}:${r.icon}`).join("|");
  useLayoutEffect(() => {
    const container = root.current, measurements = measure.current, counter = more.current;
    if (!container || !measurements || !counter) return;
    const fit = () => {
      const widths = [...measurements.children].map(e => e.getBoundingClientRect().width);
      const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 0;
      let visible = widths.length;
      while (visible > 1) {
        counter.textContent = `+${widths.length - visible}`;
        const overflow = visible < widths.length ? counter.getBoundingClientRect().width + gap : 0;
        if (widths.slice(0, visible).reduce((a, b) => a + b, 0) + gap * (visible - 1) + overflow <= container.clientWidth) break;
        visible--;
      }
      setCount(visible);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    observer.observe(measurements);
    return () => observer.disconnect();
  }, [identity]);
  const visible = Math.min(count, rows.length), hidden = rows.slice(visible);
  return <div ref={root} className={styles.references} data-strategy-reference-summary={kind} data-reference-count={visible}>
    {rows.slice(0, visible).map(row => <Reference key={row.id} row={row}/>)}
    {hidden.length ? <HoverCard openDelay={180} closeDelay={180}>
      <HoverCardTrigger asChild><Link href={href} className={`${styles.moreReferences} text-primary-text tabular-nums`} aria-label={`${label} +${hidden.length}`} data-strategy-reference-overflow={kind}>+{hidden.length}</Link></HoverCardTrigger>
      <HoverCardContent align="start" side="bottom" className={styles.referencePreview} aria-label={label} data-strategy-reference-preview={kind}>
        <ul className={styles.referenceList}>{hidden.map(row => <li key={row.id}><Reference row={row}/></li>)}</ul>
      </HoverCardContent>
    </HoverCard> : null}
    <div ref={measure} className={styles.referenceMeasure} aria-hidden="true">{rows.map(row => <span key={row.id} className={styles.referenceItem}><ReferenceContent row={row}/></span>)}</div>
    <span ref={more} className={`${styles.referenceMeasure} tabular-nums`} aria-hidden="true">+{rows.length}</span>
  </div>;
}
