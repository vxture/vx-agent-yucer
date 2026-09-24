"use client";

import { TruncatedText } from "./truncated-text";
import { Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection } from "./collapsible-section";
import { Tag } from "./tag";

// 外部动态 (YC-021 L1 工商舆情异动): external events matched to this customer,
// newest first, each WITH ITS SOURCE. A signal is evidence and frozen on
// arrival, so what is shown is what came in.
//
// IN THE CENTRE, AS LIGHT CARDS (owner, 2026-09-24: 迁移到中心内容区, 每条
// 清楚展示, 轻量 card, 提供关联操作). NOT A SECOND INBOX: triage - promote,
// dismiss, rescore - lives in 商机智探 (/signal) and this panel links there
// rather than rebuilding it (owner: 不能重复造轮子). Every link that leaves
// the customer page opens a NEW TAB, so the page the reader was working on
// stays where it was.
//
// An empty list renders nothing, the same rule as 档案缺口.

export interface AccountSignalRow {
  readonly id: string;
  readonly typeLabel: string;
  readonly subject: string;
  readonly source: string;
  /** source_ref when it is a web address; otherwise the ref is not a link. */
  readonly href: string | null;
  readonly daysAgo: number;
}

/** How many cards the panel shows; the rest are one click away in 商机智探. */
const SHOWN = 4;

export function AccountSignals({ rows }: { readonly rows: readonly AccountSignalRow[] }) {
  const { SIGNAL_PANEL_TEXT } = useMessages();
  if (rows.length === 0) return null;
  const newest = rows[0]!;
  const sourceName = (s: string) => SIGNAL_PANEL_TEXT.sourceLabel[s] ?? s;
  const external = { target: "_blank", rel: "noopener noreferrer" } as const;
  return (
    <CollapsibleSection
      summary={SIGNAL_PANEL_TEXT.summary(rows.length, newest.daysAgo)}
      // Handling happens in the signal inbox; this panel only reads.
      menu={{ view: { href: "/signal" }, edit: { href: "/signal" } }}
      icon="newspaper"
      tone="raised"
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
      title={
        <span className="inline-flex items-center gap-xs whitespace-nowrap">
          <span>{SIGNAL_PANEL_TEXT.title}</span>
        </span>
      }
    >
      <div className="grid gap-sm sm:grid-cols-2">
        {rows.slice(0, SHOWN).map((r) => (
          <div key={r.id} className="border-border bg-card/60 flex min-w-0 flex-col gap-xs rounded-md border p-sm">
            <div className="flex items-center justify-between gap-xs">
              <Tag>{r.typeLabel}</Tag>
              <span className="text-muted-foreground text-body-sm tabular-nums">{SIGNAL_PANEL_TEXT.when(r.daysAgo)}</span>
            </div>
            <TruncatedText text={r.subject} className="text-foreground line-clamp-2 text-body-sm font-medium" />
            <div className="text-muted-foreground mt-auto flex flex-wrap items-center justify-between gap-x-sm gap-y-2xs text-body-sm">
              <TruncatedText text={SIGNAL_PANEL_TEXT.source(sourceName(r.source))} className="min-w-0 truncate" />
              <span className="flex items-center gap-sm">
                {r.href ? (
                  <a href={r.href} {...external} className="text-primary inline-flex items-center gap-3xs hover:underline">
                    {SIGNAL_PANEL_TEXT.openSource}
                    <Icon name="external-link" size="xs" />
                  </a>
                ) : null}
                <a
                  href={`/signal?focus=${encodeURIComponent(r.id)}`}
                  {...external}
                  className="text-primary inline-flex items-center gap-3xs hover:underline"
                >
                  {SIGNAL_PANEL_TEXT.handleInInbox}
                  <Icon name="external-link" size="xs" />
                </a>
              </span>
            </div>
          </div>
        ))}
      </div>
      <a
        href="/signal"
        {...external}
        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-3xs self-center text-body-sm"
      >
        {SIGNAL_PANEL_TEXT.viewAll(rows.length)}
        <Icon name="external-link" size="xs" />
      </a>
    </CollapsibleSection>
  );
}
