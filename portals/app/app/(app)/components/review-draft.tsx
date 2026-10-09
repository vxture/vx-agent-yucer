"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Icon, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { explainModelPlaneError, isModelPlaneError } from "../lib/model-plane-error";
import type { ReviewNarrativeResult } from "../pipeline/review-narrative-action";
import type { ReviewDraft } from "../../domains/pipeline/lib/review-draft";

// 复盘底稿 on the review card (deal batch 12, YC-069 section 09): the rule's
// four sections - 在哪开始滑、谁没兑现、覆盖缺谁、让了几轮 - each one line that
// opens to the records it was built from. Written from the deal's own logs;
// it suggests no reason code (原因码不预选).

export function ReviewDraftSections({
  draft,
  opportunityId,
  reasonName,
  onNarrate,
  onAdoptReason,
}: {
  readonly draft: ReviewDraft;
  readonly opportunityId: string;
  /** Reason id to its name, for the suggestion. */
  readonly reasonName: ReadonlyMap<string, string>;
  /** 复盘叙述 (12b); absent when the member may not run it. */
  readonly onNarrate?: (opportunityId: string) => Promise<ReviewNarrativeResult>;
  /** Puts the suggested reason into the form - pressed by the reviewer, never automatic. */
  readonly onAdoptReason?: (reasonId: string) => void;
}) {
  const { REVIEW_DRAFT_TEXT: T, DECISION_ROLE_LABEL, DIRECTION_LABEL, REVIEW_ERROR, COPILOT_TEXT } = useMessages();
  const [pending, start] = useTransition();
  const [told, setTold] = useState<Extract<ReviewNarrativeResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const field = (f: string) => T.field[f] ?? f;
  return (
    <div className="border-border flex flex-col gap-2xs border-t pt-sm text-body-small">
      <p className="text-foreground font-medium">{T.title}</p>
      <Part
        title={T.slipTitle}
        line={draft.slip.firstAt ? T.slipLine(draft.slip.firstAt, draft.slip.stageThen, draft.slip.events.length) : T.slipNone}
        href={`/pipeline/${opportunityId}#progress`}
        more={T.more}
      >
        {draft.slip.events.map((e, i) => (
          <li key={i} className="tabular-nums">
            <span className="text-muted-foreground">{e.at}</span> {field(e.field)} {T.change(e.from ?? "-", e.to ?? "-")}
          </li>
        ))}
      </Part>
      <Part title={T.promisesTitle} line={draft.promises.length ? T.promisesLine(draft.promises.length) : T.promisesNone} more={T.more}>
        {draft.promises.map((p) => (
          <li key={p.id}>
            <span className="text-muted-foreground">{p.dueAt}</span> {DIRECTION_LABEL[p.direction] ?? p.direction} {p.statement} ·{" "}
            {T.state[p.state] ?? p.state}
          </li>
        ))}
      </Part>
      <Part
        title={T.coverageTitle}
        line={
          draft.coverage.missingRoles.length || draft.coverage.cold.length
            ? T.coverageLine(draft.coverage.missingRoles.map((r) => DECISION_ROLE_LABEL[r] ?? r).join(T.sep), draft.coverage.cold.length)
            : T.coverageNone
        }
        href={`/pipeline/${opportunityId}#buying-roles-panel`}
        more={T.more}
      >
        {draft.coverage.cold.map((c) => (
          <li key={c.name}>
            {c.name}（{DECISION_ROLE_LABEL[c.role] ?? c.role}）· {c.lastDays === null ? T.neverContacted : T.coldDays(c.lastDays)}
          </li>
        ))}
      </Part>
      <Part
        title={T.concessionTitle}
        line={draft.concessions.rounds || draft.concessions.cuts.length ? T.concessionLine(draft.concessions.rounds, draft.concessions.cuts.length) : T.concessionNone}
        more={T.more}
      >
        {draft.concessions.signatures.map((s, i) => (
          <li key={`s${i}`} className="tabular-nums">
            <span className="text-muted-foreground">{s.at}</span> {T.signature(s.product, s.belowFloor)}
          </li>
        ))}
        {draft.concessions.cuts.map((c, i) => (
          <li key={`c${i}`} className="tabular-nums">
            <span className="text-muted-foreground">{c.at}</span> {field(c.field)} {T.change(c.from ?? "-", c.to ?? "-")}
          </li>
        ))}
      </Part>
      {onNarrate ? (
        <div className="border-border mt-xs flex flex-col gap-xs rounded-md border border-dashed p-sm">
          <div className="flex items-center justify-between gap-sm">
            <span className="text-foreground flex items-center gap-2xs font-medium">
              <Icon name="sparkles" size="xs" />
              {T.narrativeTitle}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await onNarrate(opportunityId);
                  if (r.ok) {
                    setTold(r);
                    setError(null);
                  } else {
                    setError(
                      isModelPlaneError(r.error)
                        ? explainModelPlaneError(r.error, COPILOT_TEXT)
                        : (REVIEW_ERROR[r.error] ?? REVIEW_ERROR.unknown ?? r.error),
                    );
                  }
                })
              }
            >
              {pending ? T.narrating : T.narrate}
            </Button>
          </div>
          {error ? <StatusBadge tone="warning">{error}</StatusBadge> : null}
          {told ? (
            <>
              {told.narrative.map((s) => (
                <p key={s}>{s}</p>
              ))}
              {told.reasonId ? (
                <p className="flex flex-wrap items-center gap-xs">
                  <span className="text-muted-foreground">{T.suggested(reasonName.get(told.reasonId) ?? told.reasonId)}</span>
                  {onAdoptReason ? (
                    <Button size="sm" variant="ghost" onClick={() => onAdoptReason(told.reasonId!)}>
                      {T.adoptReason}
                    </Button>
                  ) : null}
                </p>
              ) : null}
              {told.dropped > 0 ? <p className="text-muted-foreground">{T.dropped(told.dropped)}</p> : null}
              {told.cached ? <p className="text-muted-foreground">{T.cached}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Part({
  title,
  line,
  href,
  more,
  children,
}: {
  readonly title: string;
  readonly line: string;
  readonly href?: string;
  readonly more: string;
  readonly children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <details>
      <summary className="cursor-pointer">
        <span className="text-muted-foreground">{title}</span> {line}
      </summary>
      {items.length > 0 ? <ul className="text-muted-foreground ml-md mt-2xs flex list-disc flex-col gap-3xs">{children}</ul> : null}
      {href ? (
        <Link href={href} className="text-primary ml-md hover:underline">
          {more}
        </Link>
      ) : null}
    </details>
  );
}
