"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { explainModelPlaneError, isModelPlaneError } from "../lib/model-plane-error";
import type { SituationResult } from "../pipeline/deal-situation-action";

// 局势简报 · 风险解读 · 卡点诊断 in 本单参谋 (deal batch 8b, YC-069: "卡片标题
// 下一段三句话，淡底；每句末尾小角标可展开引用").
//
// THE RULE'S LEVELS ARE NOT HERE. The five dimensions' scores stay on 态势判决;
// this card says why each is where it is and what would move it, and opening
// an explanation changes nothing. The rule's 卡在谁 and the 参谋's 为什么卡
// are two lines with two source labels.
//
// "底层数据变化后显示正在更新，不显示旧简报": the deck hands over what is
// already written for the data AS IT STANDS; when nothing is, the card asks
// once on mount and says it is updating - it never shows an older brief.

export type SituationView = Extract<SituationResult, { ok: true }>;

export function DealSituation({
  opportunityId,
  initial,
  onRun,
}: {
  readonly opportunityId: string;
  /** What is already written for the current data; null = write it now. */
  readonly initial: SituationView | null;
  readonly onRun: (opportunityId: string) => Promise<SituationResult>;
}) {
  const { DEAL_SITUATION_TEXT: T, DEAL_SITUATION_ERROR, DEAL_SCORE_TEXT, COPILOT_TEXT } = useMessages();
  const [view, setView] = useState<SituationView | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const asked = useRef(false);
  const explain = (code: string) =>
    isModelPlaneError(code) ? explainModelPlaneError(code, COPILOT_TEXT) : (DEAL_SITUATION_ERROR[code] ?? DEAL_SITUATION_ERROR.unknown ?? code);

  const run = () =>
    start(async () => {
      setError(null);
      const r = await onRun(opportunityId);
      if (r.ok) setView(r);
      else setError(explain(r.error));
    });
  useEffect(() => {
    if (initial || asked.current) return;
    asked.current = true;
    run();
    // Once per mount: a refusal is shown, not retried in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="bg-muted/40 border-border flex flex-col gap-sm rounded-md border p-sm text-body-sm">
      <span className="text-foreground flex items-center gap-2xs font-medium">
        <Icon name="sparkles" size="xs" />
        {T.title}
      </span>
      {view ? (
        <>
          {view.situation.summary.length > 0 ? (
            <div className="flex flex-col gap-2xs">
              {view.situation.summary.map((s, i) => (
                <Cited key={i} text={s.text} noteIds={s.noteIds} cited={view.cited} />
              ))}
            </div>
          ) : null}
          {view.stallHolder || view.situation.stall ? (
            <div className="flex flex-col gap-2xs">
              <p className="text-muted-foreground">{T.stallTitle}</p>
              {view.stallHolder ? (
                <p>
                  <span className="text-muted-foreground">{T.byRule}</span>
                  {view.stallHolder}
                </p>
              ) : null}
              {view.situation.stall ? (
                <Cited
                  text={`${T.byAdvisor}${view.situation.stall.why}`}
                  noteIds={view.situation.stall.quote ? [view.situation.stall.quote.noteId] : []}
                  cited={view.cited}
                  quote={view.situation.stall.quote?.text}
                />
              ) : null}
            </div>
          ) : null}
          {view.situation.risks.length > 0 ? (
            <div className="flex flex-col gap-2xs">
              <p className="text-muted-foreground">{T.risksTitle}</p>
              {view.situation.risks.map((r) => (
                <Risk
                  key={r.dimension}
                  label={DEAL_SCORE_TEXT.factor[r.dimension] ?? r.dimension}
                  why={r.why}
                  change={r.change}
                  noteIds={r.noteIds}
                  cited={view.cited}
                />
              ))}
            </div>
          ) : null}
          <p className="text-muted-foreground">
            {[T.source, ...(view.situation.dropped > 0 ? [T.dropped(view.situation.dropped)] : [])].join(" · ")}
          </p>
        </>
      ) : pending ? (
        <p className="text-muted-foreground">{T.updating}</p>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-sm">
          <p className="text-muted-foreground">{error}</p>
          <Button size="sm" variant="ghost" onClick={run}>
            {T.retry}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground">{T.updating}</p>
      )}
    </section>
  );
}

/** One sentence and a small mark that opens the notes it rests on. */
function Cited({
  text,
  noteIds,
  cited,
  quote,
}: {
  readonly text: string;
  readonly noteIds: readonly string[];
  readonly cited: SituationView["cited"];
  readonly quote?: string;
}) {
  const { DEAL_SITUATION_TEXT: T } = useMessages();
  const [open, setOpen] = useState(false);
  const notes = noteIds.map((id) => ({ id, ...cited[id] })).filter((n) => n.text !== undefined);
  return (
    <div>
      <p>
        {text}
        {notes.length > 0 ? (
          <button
            type="button"
            className="text-primary ml-2xs align-super text-label-sm hover:underline"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {T.cite(notes.length)}
          </button>
        ) : null}
      </p>
      {open ? (
        <div className="mt-2xs flex flex-col gap-2xs">
          {quote ? <blockquote className="border-primary/40 border-l-2 pl-sm">{T.quoted(quote)}</blockquote> : null}
          {notes.map((n) => (
            <blockquote key={n.id} className="border-border text-muted-foreground border-l-2 pl-sm">
              <cite className="not-italic tabular-nums">{n.date}</cite> {n.text}
            </blockquote>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 风险解读 - one dimension, folded: why it is at its level, what would move it. */
function Risk({
  label,
  why,
  change,
  noteIds,
  cited,
}: {
  readonly label: string;
  readonly why: string;
  readonly change: string;
  readonly noteIds: readonly string[];
  readonly cited: SituationView["cited"];
}) {
  const { DEAL_SITUATION_TEXT: T } = useMessages();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="text-foreground flex w-full items-center gap-2xs text-left hover:underline"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size="xs" />
        {label}
      </button>
      {open ? (
        <div className="ml-md mt-2xs flex flex-col gap-2xs">
          <Cited text={`${T.why}${why}`} noteIds={noteIds} cited={cited} />
          {change ? (
            <p>
              <span className="text-muted-foreground">{T.change}</span>
              {change}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
