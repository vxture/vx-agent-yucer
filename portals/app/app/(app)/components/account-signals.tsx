"use client";

import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection } from "./collapsible-section";
import { CapBadge, LayerLabel } from "./panorama-annotations";
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
      <ul className="flex flex-col gap-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-3xs">
            <span className="text-body-sm">{r.subject}</span>
            <span className="text-muted-foreground flex flex-wrap items-center gap-xs text-body-sm">
              <Tag>{r.typeLabel}</Tag>
              <span>{SIGNAL_PANEL_TEXT.when(r.daysAgo)}</span>
              {r.href ? (
                <a href={r.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {SIGNAL_PANEL_TEXT.source(r.source)}
                </a>
              ) : (
                <span>{SIGNAL_PANEL_TEXT.source(r.source)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}
