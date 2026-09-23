"use client";

import { MemberName, useMemberName } from "../lib/member-names";
import { useState } from "react";
import {
  Button,
  EmptyState,
  Icon,
  Section,
  StatusBadge,
  type IconName,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";

const DAY_MS = 86_400_000;

const CHANNEL_ICON: Record<string, IconName> = {
  call: "phone",
  meeting: "users",
  visit: "map-pin",
  email: "mail",
  im: "chat-circle",
  event: "calendar",
  other: "file-text",
};

// What actually happened, newest first.
//
// The note is shown VERBATIM. Everything downstream - the health score, the
// decision chain, and eventually every judgement the agent makes - cites these
// rows, so the thing a reader can open must be the thing that was cited. A
// tidied-up summary displayed in place of the original would make provenance a
// story rather than a fact.
//
// A server component: past facts, nothing to interact with.

export interface TimelineItem {
  readonly id: string;
  readonly channel: string;
  readonly occurredAt: Date;
  readonly actorSub: string;
  readonly actorName?: string | null;
  readonly participantNames?: readonly string[];
  readonly rawNote: string;
  readonly correctsInteractionId: string | null;
}

export interface InteractionTimelineProps {
  readonly items: readonly TimelineItem[];
  /**
   * How many to show before the fold. Absent = all of them.
   *
   * A DETAIL PAGE BOUNDS IT; a page that is only the timeline does not. The
   * account page carries seven other dimensions, and dumping twenty-three notes
   * into the middle of them buries every one of the others - the reader loses
   * the map to gain a history they did not ask for yet.
   */
  readonly limit?: number;
  /** 默认 false, 不改 pipeline 详情页的样子 (owner, 2026-09-20: 去掉所有
   *  垃圾说明 - 账户详情页传 true, 见 org-unit-panel.tsx 同名注释). */
  readonly hideDescription?: boolean;
  /** 默认 false, 不改 pipeline 详情页的样子 - 那边这张卡是独立一张, 标题
   *  就是唯一的标题。账户详情页传 true (owner, 2026-09-21: 继续梳理阵地
   *  清单) - 那边这张卡挂在"跟进记录 (N)"这个 tab 里面, tab 本身已经说过
   *  一次"跟进记录", 卡自己的标题再说一遍是重复。 */
  readonly hideTitle?: boolean;
  readonly action?: React.ReactNode;
}

export function InteractionTimeline({
  items,
  limit,
  hideDescription,
  hideTitle,
  action: externalAction,
}: InteractionTimelineProps) {
  const { CHANNEL_LABEL, FIELD_TEXT } = useMessages();
  const nameOf = useMemberName();
  const [open, setOpen] = useState(false);
  // Expands IN PLACE rather than opening a page. A note is read in the context
  // of the account it belongs to, and a route that shows the same notes without
  // the health score beside them is a worse version of this page.
  const bounded = limit !== undefined && !open && items.length > limit;
  const shown = bounded ? items.slice(0, limit) : items;

  const expandButton =
    limit !== undefined && items.length > limit ? (
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        {open
          ? FIELD_TEXT.timelineCollapse
          : FIELD_TEXT.timelineShown(limit, items.length)}
        <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
      </Button>
    ) : null;

  const sectionAction =
    expandButton || externalAction ? (
      <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        {externalAction}
        {expandButton}
      </span>
    ) : null;

  // tone="raised" - 设计图是全面card化 (owner, 2026-09-20; 理由见
  // org-unit-panel.tsx 同名注释).
  if (items.length === 0) {
    return (
      <Section
        tone="raised"
        style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
        title={hideTitle ? undefined : FIELD_TEXT.timelineTitle}
        description={hideDescription ? undefined : FIELD_TEXT.timelineDescription}
        action={externalAction}
      >
        <EmptyState
          title={FIELD_TEXT.recordEmpty}
          description={FIELD_TEXT.recordEmptyDescription}
        />
      </Section>
    );
  }

  return (
    <Section
      tone="raised"
      style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
      title={hideTitle ? undefined : FIELD_TEXT.timelineTitle}
      description={hideDescription ? undefined : FIELD_TEXT.timelineDescription}
      action={sectionAction}
    >
      <div className="flex flex-col gap-sm">
        {shown.map((i) => (
          <div key={i.id} className="flex items-start gap-xs">
            <span className="text-muted-foreground mt-3xs shrink-0">
              <Icon name={CHANNEL_ICON[i.channel] ?? "file-text"} size="sm" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-muted-foreground flex flex-wrap items-center gap-2xs text-[11px]">
                <span>
                  {i.actorName ?? nameOf(i.actorSub)}
                  {i.participantNames?.length ? ` → ${i.participantNames.join(FIELD_TEXT.timelineParticipantSep)}` : null}
                </span>
                <span>{"·"}</span>
                <time dateTime={i.occurredAt.toISOString()}>
                  {(() => {
                    const d = Math.floor((Date.now() - i.occurredAt.getTime()) / DAY_MS);
                    return d <= 0 ? FIELD_TEXT.timelineToday : FIELD_TEXT.timelineDaysAgo(d);
                  })()}
                </time>
                <span>{"·"}</span>
                <span>{CHANNEL_LABEL[i.channel] ?? i.channel}</span>
                {i.correctsInteractionId ? (
                  <StatusBadge tone="warning">
                    {FIELD_TEXT.timelineCorrects}
                  </StatusBadge>
                ) : null}
              </div>
              <p className="text-foreground mt-2xs text-body-sm leading-relaxed">{i.rawNote}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
