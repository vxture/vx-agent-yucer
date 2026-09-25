"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, NativeSelect, StatusBadge, Textarea } from "@vxture/design-ui";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection } from "./collapsible-section";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

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
  onRecord,
}: DealReviewProps) {
  const { WINLOSS_TEXT, REVIEW_ERROR, DEAL_PAGE_TEXT, PANEL_MENU_TEXT } = useMessages();
  const won = status === "won";
  // The reasons that can explain THIS outcome - "not won" covers abandoned.
  const fitting = reasons.filter((r) => (won ? r.forWon : r.forLost));
  const [editing, setEditing] = useState(review === null);
  const [reason, setReason] = useState(review?.primaryReasonId ?? "");
  const [competitor, setCompetitor] = useState(review?.competitor ?? "");
  const [lessons, setLessons] = useState(review?.lessons ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  function submit() {
    setError(null);
    startTransition(() => {
      void onRecord(opportunityId, { primaryReasonId: reason || null, competitor, lessons }).then((r) => {
        if (!r.ok) {
          setError(REVIEW_ERROR[r.error ?? "denied"] ?? REVIEW_ERROR.denied);
          return;
        }
        setEditing(false);
      });
    });
  }

  const reasonName = reasons.find((r) => r.id === (review?.primaryReasonId ?? ""))?.name ?? WINLOSS_TEXT.reasonNone;

  return (
    <CollapsibleSection {...frame}>
      {exitReason ? <Tag>{WINLOSS_TEXT.dealReviewExit(exitReason)}</Tag> : null}

      {review && !editing ? (
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-md gap-y-xs text-body-sm">
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

      {editing && canRecord ? (
        <>
          <Label htmlFor="deal-review-reason">{WINLOSS_TEXT.reasonLabel}</Label>
          <NativeSelect id="deal-review-reason" value={reason} onChange={(e) => setReason(e.currentTarget.value)} disabled={pending}>
            <option value="">{WINLOSS_TEXT.reasonNone}</option>
            {fitting.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
          <Label htmlFor="deal-review-competitor">{WINLOSS_TEXT.competitorLabel}</Label>
          <Input id="deal-review-competitor" value={competitor} onChange={(e) => setCompetitor(e.currentTarget.value)} disabled={pending} />
          <Label htmlFor="deal-review-lessons">{WINLOSS_TEXT.lessonsLabel}</Label>
          <Textarea id="deal-review-lessons" value={lessons} onChange={(e) => setLessons(e.currentTarget.value)} disabled={pending} />
          <div className="flex gap-sm">
            {review ? (
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                {WINLOSS_TEXT.cancel}
              </Button>
            ) : null}
            <Button onClick={submit} disabled={pending}>
              {WINLOSS_TEXT.save}
            </Button>
          </div>
        </>
      ) : null}

      {!review && !canRecord ? <Tag>{WINLOSS_TEXT.recordHintDenied}</Tag> : null}
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
    </CollapsibleSection>
  );
}
