"use client";

import { useState } from "react";
import { ReviewForm } from "./review-form";
import { Button, StatusBadge } from "@vxture/design-ui";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection } from "./collapsible-section";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import { ReviewDraftSections } from "./review-draft";
import type { ReviewDraft } from "../../domains/pipeline/lib/review-draft";
import type { ReviewNarrativeResult } from "../pipeline/review-narrative-action";

// 结局与复盘 on the deal page itself (YC-065 R7: 入口在作战页关单后首屏,
// and /winloss's queue is the same form). Before this, a closed deal's page
// only hinted "a review is owed" after the close - writing it meant leaving
// for another page and finding the deal again.
//
// THE OUTCOME IS NOT ASKED. It is the deal's own status, derived server-side,
// exactly as on /winloss: a review claiming "won" on a lost deal would corrupt
// the dataset the learning loop reads.
//
// BELOW THE WINLOSS TIER the card still appears, saying so (YC-068): hiding it
// would make a closed deal look complete when a paid step is simply absent.

export interface DealReviewProps {
  readonly opportunityId: string;
  /** won | lost | abandoned - the card only renders for a closed deal. */
  readonly status: string;
  /** False below the business tier: the card says the step exists and is locked. */
  readonly entitled: boolean;
  readonly canRecord: boolean;
  /** The recorded exit reason (lost / abandoned), already labelled. */
  readonly exitReason: string | null;
  readonly review: {
    readonly primaryReasonId: string | null;
    readonly competitor: string | null;
    readonly lessons: string | null;
  } | null;
  readonly reasons: readonly { readonly id: string; readonly name: string; readonly forWon: boolean; readonly forLost: boolean }[];
  /** The workspace's rivals (incr/0094), offered as the rival box's suggestions;
   *  a typed name is matched to one of them - or added - when saved. */
  readonly knownRivals?: readonly string[];
  /** 复盘底稿 (deal batch 12): the rule's four sections; absent below the tier. */
  readonly draft?: ReviewDraft | null;
  /** 复盘叙述 (12b), shown only when canNarrate. */
  readonly onNarrate?: (opportunityId: string) => Promise<ReviewNarrativeResult>;
  readonly canNarrate?: boolean;
  readonly onRecord: (
    opportunityId: string,
    input: { primaryReasonId: string | null; competitor?: string; lessons?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function DealReview({
  opportunityId,
  status,
  entitled,
  canRecord,
  exitReason,
  review,
  reasons,
  knownRivals = [],
  draft = null,
  onNarrate,
  canNarrate = false,
  onRecord,
}: DealReviewProps) {
  const { WINLOSS_TEXT, DEAL_PAGE_TEXT, PANEL_MENU_TEXT } = useMessages();
  const won = status === "won";
  // The reasons that can explain THIS outcome - "not won" covers abandoned.
  const [editing, setEditing] = useState(review === null);

  const outcome = won
    ? WINLOSS_TEXT.outcomeWon
    : status === "abandoned"
      ? WINLOSS_TEXT.outcomeAbandoned
      : WINLOSS_TEXT.outcomeLost;
  const tags = (
    <>
      {/* Abandoned is our decision, not a verdict on the deal - a Tag, since a
          neutral StatusBadge would draw a meaningless dash. */}
      {status === "abandoned" ? (
        <Tag>{outcome}</Tag>
      ) : (
        <StatusBadge tone={won ? "success" : "danger"} dot>
          {outcome}
        </StatusBadge>
      )}
      {!review ? <StatusBadge tone="warning">{WINLOSS_TEXT.dealReviewOwed}</StatusBadge> : null}
    </>
  );

  // A deal-page panel like every other (deal batch 2): folds, one line.
  const frame = {
    id: "deal-review",
    tone: "raised" as const,
    style: CARD_VEIL_STYLE,
    className: CARD_VEIL_CLASS,
    icon: "scales" as const,
    title: WINLOSS_TEXT.dealReviewTitle,
    action: tags,
    summary: review ? DEAL_PAGE_TEXT.reviewSummaryDone(outcome) : DEAL_PAGE_TEXT.reviewSummaryOwed(outcome),
    menu: {
      view: { href: "/winloss" },
      edit: review && canRecord && entitled ? { onSelect: () => setEditing(true) } : { hint: PANEL_MENU_TEXT.noEditRight },
    },
  };

  if (!entitled) {
    return (
      <CollapsibleSection {...frame}>
        <Tag>{WINLOSS_TEXT.dealReviewLocked}</Tag>
      </CollapsibleSection>
    );
  }

  const reasonName = reasons.find((r) => r.id === (review?.primaryReasonId ?? ""))?.name ?? WINLOSS_TEXT.reasonNone;

  return (
    <CollapsibleSection {...frame}>
      {exitReason ? <Tag>{WINLOSS_TEXT.dealReviewExit(exitReason)}</Tag> : null}

      {review && !editing ? (
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-md gap-y-xs text-body-small">
          <dt className="text-muted-foreground">{WINLOSS_TEXT.reasonLabel}</dt>
          <dd>{reasonName}</dd>
          <dt className="text-muted-foreground">{WINLOSS_TEXT.competitorLabel}</dt>
          <dd>{review.competitor || "-"}</dd>
          <dt className="text-muted-foreground">{WINLOSS_TEXT.lessonsLabel}</dt>
          <dd className="whitespace-pre-wrap">{review.lessons || "-"}</dd>
        </dl>
      ) : null}

      {review && !editing && canRecord ? (
        <Button variant="outline" onClick={() => setEditing(true)}>
          {WINLOSS_TEXT.dealReviewEdit}
        </Button>
      ) : null}

      {editing && canRecord ? <ReviewForm opportunityId={opportunityId} status={status} review={review} reasons={reasons} knownRivals={knownRivals}
        draft={draft} onNarrate={canNarrate ? onNarrate : undefined} onRecord={onRecord} onSaved={() => setEditing(false)}
        onCancel={review ? () => setEditing(false) : undefined}/> : null}
      {!editing && draft ? <ReviewDraftSections draft={draft} opportunityId={opportunityId} reasonName={new Map(reasons.map(r => [r.id, r.name]))}
        onNarrate={canNarrate ? onNarrate : undefined}/> : null}
    </CollapsibleSection>
  );
}
