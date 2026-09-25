"use client";

import { useState, useTransition } from "react";
import { Button, Field, FieldDescription, FieldLabel, Icon, Input, Section, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import {
  DEAL_SCORE_FACTORS,
  DEFAULT_DEAL_SCORE_WEIGHTS,
  type DealScoreFactor,
  type DealScoreWeights,
} from "../../domains/pipeline/lib/deal-score";

// 商机评估分 - the weights of the deal's 0-100 score (incr/0091; owner,
// 2026-09-25: 100分，设计一套加权计算逻辑，参数调整放到admin板块).
//
// THE WEIGHTS ARE A BAR, like 预测阈值's ruler: seven shares of one 100, so
// the proportions are seen, not added up in the head. The inputs under it are
// the numbers; the total says whether they reach 100 before anything is sent.
// Its own save, not the shared bar below: a weight set is saved whole or not
// at all, and it has its own refusal dictionary.

const SHARE_TONES = [
  "bg-primary/60",
  "bg-primary/50",
  "bg-primary/40",
  "bg-primary/30",
  "bg-primary/25",
  "bg-primary/20",
  "bg-primary/15",
];

type Form = Record<DealScoreFactor | "watchScore" | "recentDays" | "quietDays", string>;

const toForm = (w: DealScoreWeights): Form => ({
  ...(Object.fromEntries(DEAL_SCORE_FACTORS.map((f) => [f, String(w.weights[f])])) as Record<DealScoreFactor, string>),
  watchScore: String(w.watchScore),
  recentDays: String(w.recentDays),
  quietDays: String(w.quietDays),
});

export function DealScoreConfig({
  weights,
  editable,
  onSave,
}: {
  readonly weights: DealScoreWeights;
  readonly editable: boolean;
  readonly onSave: (input: DealScoreWeights) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { DEAL_SCORE_TEXT, DEAL_SCORE_ERROR } = useMessages();
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(toForm(weights));
  const [pending, start] = useTransition();
  const n = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  const parsed: DealScoreWeights = {
    weights: Object.fromEntries(DEAL_SCORE_FACTORS.map((f) => [f, n(form[f])])) as Record<DealScoreFactor, number>,
    watchScore: n(form.watchScore),
    recentDays: n(form.recentDays),
    quietDays: n(form.quietDays),
  };
  const sum = DEAL_SCORE_FACTORS.reduce((t, f) => t + (Number.isFinite(parsed.weights[f]) ? parsed.weights[f] : 0), 0);
  const dirty = JSON.stringify(toForm(weights)) !== JSON.stringify(form);
  const save = () =>
    start(async () => {
      const r = await onSave(parsed);
      if (!r.ok) {
        toast({ tone: "danger", title: DEAL_SCORE_ERROR[r.error ?? "unknown"] ?? DEAL_SCORE_ERROR.unknown ?? r.error });
        return;
      }
      toast({ tone: "success", title: DEAL_SCORE_TEXT.saved });
    });
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const disabled = pending || !editable;

  return (
    <Section
      icon="gauge"
      title={DEAL_SCORE_TEXT.title}
      description={DEAL_SCORE_TEXT.why}
      action={<Tag tone={sum === 100 ? "neutral" : "danger"}>{DEAL_SCORE_TEXT.sum(sum)}</Tag>}
    >
      <div className="gap-lg flex">
        <span className="invisible shrink-0" aria-hidden="true">
          <Icon name="gauge" size="lg" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-md">
          <Field>
            <FieldLabel>{DEAL_SCORE_TEXT.weightsLabel}</FieldLabel>
            <div className="border-border mt-xs flex h-8 w-full overflow-hidden rounded-md border">
              {DEAL_SCORE_FACTORS.map((f, i) =>
                (parsed.weights[f] || 0) > 0 ? (
                  <div
                    key={f}
                    style={{ width: `${(100 * parsed.weights[f]) / Math.max(sum, 1)}%` }}
                    className={`border-border text-label-sm flex shrink-0 items-center justify-center overflow-hidden border-r px-2xs whitespace-nowrap last:border-r-0 ${SHARE_TONES[i]}`}
                    title={`${DEAL_SCORE_TEXT.factor[f]} ${parsed.weights[f]}`}
                  >
                    {DEAL_SCORE_TEXT.factor[f]}
                  </div>
                ) : null,
              )}
            </div>
            <div className="mt-sm grid grid-cols-2 gap-sm sm:grid-cols-4 xl:grid-cols-7">
              {DEAL_SCORE_FACTORS.map((f) => (
                <label key={f} className="flex flex-col gap-2xs">
                  <span className="text-muted-foreground text-body-sm">{DEAL_SCORE_TEXT.factor[f]}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-control-xs"
                    value={form[f]}
                    disabled={disabled}
                    aria-invalid={!(Number.isInteger(parsed.weights[f]) && parsed.weights[f] >= 0 && parsed.weights[f] <= 100)}
                    onChange={(e) => set(f, e.target.value)}
                  />
                  <span className="text-muted-foreground text-[11px]">{DEAL_SCORE_TEXT.factorHow[f]}</span>
                </label>
              ))}
            </div>
            <FieldDescription>{DEAL_SCORE_TEXT.weightsHint}</FieldDescription>
          </Field>
          <div className="grid gap-md sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="ds-watch">{DEAL_SCORE_TEXT.watchLabel}</FieldLabel>
              <Input id="ds-watch" type="number" inputMode="numeric" className="max-w-[8rem]" value={form.watchScore} disabled={disabled} onChange={(e) => set("watchScore", e.target.value)} />
              <FieldDescription>{DEAL_SCORE_TEXT.watchHint}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ds-recent">{DEAL_SCORE_TEXT.recentLabel}</FieldLabel>
              <Input id="ds-recent" type="number" inputMode="numeric" className="max-w-[8rem]" value={form.recentDays} disabled={disabled} onChange={(e) => set("recentDays", e.target.value)} />
              <FieldDescription>{DEAL_SCORE_TEXT.recentHint}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ds-quiet">{DEAL_SCORE_TEXT.quietLabel}</FieldLabel>
              <Input id="ds-quiet" type="number" inputMode="numeric" className="max-w-[8rem]" value={form.quietDays} disabled={disabled} onChange={(e) => set("quietDays", e.target.value)} />
              <FieldDescription>{DEAL_SCORE_TEXT.quietHint}</FieldDescription>
            </Field>
          </div>
          {editable ? (
            <div className="flex items-center gap-sm">
              <Button size="sm" disabled={!dirty || pending} onClick={save}>
                {DEAL_SCORE_TEXT.save}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setForm(toForm(DEFAULT_DEAL_SCORE_WEIGHTS))}>
                {DEAL_SCORE_TEXT.reset}
              </Button>
              <span className="text-muted-foreground text-body-sm">{DEAL_SCORE_TEXT.formula}</span>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
