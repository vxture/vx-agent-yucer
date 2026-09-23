"use client";

import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection } from "./collapsible-section";
import { CapBadge, CapFooter, LayerLabel } from "./panorama-annotations";
import { Tag } from "./tag";

// 外部动态 (YC-021 L1 工商舆情异动): external events that have been matched to
// this customer, newest first, each WITH ITS SOURCE. A signal is evidence and
// frozen on arrival (subject / source / source_ref never change), so what is
// shown is what came in - including the link back to where it came from.
//
// An empty list renders nothing, the same rule as 档案缺口: a permanent "no
// news" panel is furniture on every quiet account.

export interface AccountSignalRow {
  readonly id: string;
  readonly typeLabel: string;
  readonly subject: string;
  readonly source: string;
  /** source_ref when it is a web address; otherwise the ref is not a link. */
  readonly href: string | null;
  readonly daysAgo: number;
}

export function AccountSignals({ rows }: { readonly rows: readonly AccountSignalRow[] }) {
  const { SIGNAL_PANEL_TEXT } = useMessages();
  // The feed's name is free text (web / news / campaign / ...); the known ones
  // read as words, an unknown one stays as given rather than disappearing.
  const sourceName = (s: string) => SIGNAL_PANEL_TEXT.sourceLabel[s] ?? s;
  if (rows.length === 0) return null;
  const newest = rows[0]!;
  return (
    <CollapsibleSection
      summary={SIGNAL_PANEL_TEXT.summary(rows.length, newest.daysAgo)}
      // Matching and triage live in the signal inbox; this panel only reads.
      menu={{ view: { href: "/signal" }, edit: { href: "/signal" } }}
      icon="newspaper"
      tone="raised"
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
      title={
        <span className="inline-flex items-center gap-xs whitespace-nowrap">
          <span>{SIGNAL_PANEL_TEXT.title}</span>
          <LayerLabel layer="L1" />
          <CapBadge tier="pro">Pro</CapBadge>
        </span>
      }
    >
      <ul className="divide-border flex flex-col divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2xs py-sm first:pt-0 last:pb-0">
            <span className="text-body-sm">{r.subject}</span>
            <span className="text-muted-foreground flex flex-wrap items-center gap-xs text-body-sm">
              <Tag>{r.typeLabel}</Tag>
              <span className="tabular-nums">{SIGNAL_PANEL_TEXT.when(r.daysAgo)}</span>
              <span>·</span>
              {/* The source reads the same either way; a web address is a link,
                  marked by the arrow - no second colour in a grey row. */}
              {r.href ? (
                <a href={r.href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                  {SIGNAL_PANEL_TEXT.source(sourceName(r.source))} ↗
                </a>
              ) : (
                <span>{SIGNAL_PANEL_TEXT.source(sourceName(r.source))}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <CapFooter>
        <CapBadge tier="pro">Pro</CapBadge> {SIGNAL_PANEL_TEXT.cap}
      </CapFooter>
    </CollapsibleSection>
  );
}
