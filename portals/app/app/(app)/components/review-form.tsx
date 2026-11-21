"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, FieldLabel, Input, NativeSelect, Textarea } from "@vxture/design-ui";
import type { DealReviewProps } from "./deal-review";
import { useMessages } from "../lib/i18n/provider";
import { ReviewDraftSections } from "./review-draft";

export function ReviewForm({ opportunityId, status, review, reasons, knownRivals = [], draft, onNarrate, onRecord, onSaved, onCancel, onDirtyChange }: Pick<DealReviewProps, "opportunityId" | "status" | "review" | "reasons" | "knownRivals" | "draft" | "onNarrate" | "onRecord"> & {
  readonly onSaved: () => void; readonly onCancel?: () => void; readonly onDirtyChange?: (dirty: boolean) => void;
}) {
  const { WINLOSS_TEXT: W, WINLOSS_WORKSPACE_TEXT: T, REVIEW_ERROR, DS_LABELS } = useMessages();
  const [reason, setReason] = useState(review?.primaryReasonId ?? "");
  const [competitor, setCompetitor] = useState(review?.competitor ?? "");
  const [lessons, setLessons] = useState(review?.lessons ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const dirty = reason !== (review?.primaryReasonId ?? "") || competitor !== (review?.competitor ?? "") || lessons !== (review?.lessons ?? "");
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const click = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a[href]") && !window.confirm(T.leave)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty, T.leave]);
  const fitting = reasons.filter(r => status === "won" ? r.forWon : r.forLost);
  const hasOldReason = reason && !fitting.some(r => r.id === reason);
  const submit = () => {
    if (inFlight.current) return;
    inFlight.current = true; setError(null);
    start(async () => {
      try {
        const result = await onRecord(opportunityId, { primaryReasonId: reason || null, competitor, lessons });
        if (!result.ok) { setError(REVIEW_ERROR[result.error ?? "denied"] ?? T.failed); return; }
        onSaved();
      } catch { setError(T.failed); }
      finally { inFlight.current = false; }
    });
  };
  const outcome = { won: T.won, lost: T.lost, abandoned: T.abandoned }[status as "won" | "lost" | "abandoned"];
  return <div className="flex flex-col gap-lg text-body" data-review-form>
    {draft ? <ReviewDraftSections draft={draft} opportunityId={opportunityId} reasonName={new Map(reasons.map(r => [r.id, r.name]))}
      onNarrate={pending ? undefined : onNarrate} onAdoptReason={pending ? undefined : id => setReason(id)}/> : <p className="text-muted-foreground">{T.noDraft}</p>}
    <div className="grid grid-cols-1 gap-md @xl:grid-cols-3">
      <Field><FieldLabel>{T.readonly}</FieldLabel><div className="flex min-h-control-xl items-center">{outcome}</div></Field>
      <Field><FieldLabel htmlFor={`reason-${opportunityId}`}>{W.reasonLabel}</FieldLabel>
        <NativeSelect id={`reason-${opportunityId}`} value={reason} onChange={e => setReason(e.target.value)} disabled={pending}>
          <option value="">{W.reasonNone}</option>{hasOldReason ? <option value={reason}>{reasons.find(r => r.id === reason)?.name ?? T.unknownReason}</option> : null}
          {fitting.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </NativeSelect>
      </Field>
      <Field><FieldLabel htmlFor={`rival-${opportunityId}`}>{W.competitorLabel}</FieldLabel>
        <Input id={`rival-${opportunityId}`} list={`rivals-${opportunityId}`} value={competitor} onChange={e => setCompetitor(e.target.value)} maxLength={200} placeholder={T.competitorHint} disabled={pending}/>
        <datalist id={`rivals-${opportunityId}`}>{knownRivals.map(name => <option key={name} value={name}/>)}</datalist>
      </Field>
    </div>
    <Field><FieldLabel htmlFor={`lessons-${opportunityId}`}>{W.lessonsLabel}</FieldLabel>
      <Textarea id={`lessons-${opportunityId}`} value={lessons} onChange={e => setLessons(e.target.value)} maxLength={4000} rows={5} placeholder={T.lessonsHint} disabled={pending}/>
      <span className="text-right text-body-small text-muted-foreground">{lessons.length}/4000</span>
    </Field>
    {error ? <p role="alert" className="text-danger-text">{error}</p> : null}
    <div className="sticky bottom-0 flex justify-end gap-sm border-t border-border bg-background pt-md pb-lg">
      {onCancel ? <Button variant="outline" size="xl" onClick={() => { if (!dirty || window.confirm(T.leave)) onCancel(); }} disabled={pending}>{W.cancel}</Button> : null}
      <Button size="xl" onClick={submit} disabled={pending}>{pending ? DS_LABELS.confirmPending : W.save}</Button>
    </div>
  </div>;
}
