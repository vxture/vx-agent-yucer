"use client";

import { useState, useTransition, type MouseEvent } from "react";
import {
  Field,
  FieldDescription,
  FieldLabel,
  Icon,
  Input,
  Section,
  ViewHeader,
  useToast,
} from "@vxture/design-ui";
import { FormActions } from "./form-page";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

// 账龄分档 - where this workspace cuts an overdue receivable (incr/0042).
//
// WHY IT IS CONFIGURED AT ALL. `if (late <= 30) ... if (late <= 60)` was in the
// build, with the band names spelled out in the message catalogue beside it.
// 30/60 is one common ageing policy and 30/60/90 is another, and a company
// that ages at 45 days had no way to say so.
//
// ONE ROW PER CUTOFF, NOT ONE TEXT FIELD FOR ALL OF THEM (owner, 2026-09-12:
// 页面只有一条设置，但是涉及到多条内容). A comma-separated string asked the
// admin to hand-format a list and re-type the whole thing to fix one typo, and
// it had no per-value feedback - the same `line-editor.tsx`/`catalog-forms.tsx`
// shape (`useState<string[]>` + index-matched update, a row's own remove
// button, an add button) replaces it here, one input per number.
//
// THE INPUT SITS ON THE RULER, NOT ABOVE IT (owner, 2026-09-12, second pass:
// 设置和展示需要融合在一起 - a stacked row-list-then-ruler was still two
// surfaces: a plain list to edit and a separate read-only bar to admire,
// exactly the "preview column" problem the first pass already ended, just
// moved one level up. There is now one control: each cutoff's own number
// input sits AT its position on the full-width bar, so typing 60 both sets
// the value and moves that tick - editing IS what draws the picture, not a
// second step after it.
//
// A DS `Slider` WAS THE FIRST THING TRIED HERE, AND IT DOES NOT FIT: the
// wrapper (`design-ui`'s `Slider`) hardcodes exactly one
// `SliderPrimitive.Thumb`, so it has no multi-handle mode to bind an
// arbitrary, 1-5-long cutoff list to - and dragging a handle on a 1-3650-day
// axis cannot land an exact integer anyway, which typing already does
// better. So this stays a set of ordinary number inputs; what changed is
// where they sit, not how they take a value.
//
// POSITION IS ALWAYS DEFINED, VALIDITY IS SEPARATE: a row positions itself
// off its OWN typed number against the current largest one (`refMax`),
// regardless of range or ascending-order problems - so a cutoff typed out of
// order visibly lands to the left of where it should be, which is the bug
// showing itself on the ruler rather than only in a red border. The coloured
// bands and their range labels are the one part that still needs the WHOLE
// list to hold (`allValid`, same gate the row-list version used): a segment
// mid-edit cannot state a shape built on a broken number, so it falls back
// to one flat, unlabelled bar instead.
//
// CLICK THE BAR TO INSERT, CLICK A MARKER TO REMOVE (owner, 2026-09-12,
// third pass: 做成标签式游标，点击可以插入式增加和删除，下面数字可设置数字。
// 由于复原简单，增删都无需确认). Each cutoff is a `Tag` sitting on the bar at
// its own position - clicking IT removes that cutoff, immediately, no
// confirmation dialog: Discard already reverts every unsaved change in one
// click, so a second guard on top of it would only be asked to protect
// against something the page already undoes for free. Clicking empty track
// inserts a new cutoff at that position (kept in sorted array order so the
// ascending-order check still reads left-to-right); an exact number is typed
// into the small input under each tag rather than dragged, because a drag on
// a 1-3650-day axis cannot land an integer as reliably as typing one.
const RULER_OPEN_SHARE = 0.22;
const RULER_MIN_SCALE = 30;
const RULER_BAND_TONES = ["bg-primary/10", "bg-primary/18", "bg-primary/26", "bg-primary/34", "bg-primary/42"];

export function AgeingPolicyConfig({
  cutoffs,
  canWrite,
  onSave,
}: {
  readonly cutoffs: readonly number[];
  readonly canWrite: boolean;
  readonly onSave: (cutoffs: readonly number[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { AGEING_ERROR, AGEING_TEXT, DELIVERY_TEXT } = useMessages();
  const [pending, start] = useTransition();
  const initialRows = cutoffs.length > 0 ? cutoffs.map(String) : [""];
  const [rows, setRows] = useState<readonly string[]>(initialRows);
  const { toast } = useToast();

  // Whatever they typed, as numbers. Anything unparseable becomes NaN, and a
  // row carrying one is flagged rather than silently dropped - the rule
  // refuses it by name rather than this component guessing.
  const parsed = rows.map((v) => (v.trim() === "" ? Number.NaN : Number(v)));
  const dirty = parsed.join(",") !== cutoffs.join(",");

  const MAX_CUTOFFS = 5;
  const countIssue = rows.length < 1 || rows.length > MAX_CUTOFFS;
  const rangeIssueIndex = parsed.findIndex((n) => !(Number.isInteger(n) && n >= 1 && n <= 3650));
  const orderIssueIndex = parsed.findIndex(
    (n, i) => i > 0 && Number.isInteger(n) && Number.isInteger(parsed[i - 1]) && n <= parsed[i - 1],
  );
  // SAME PRECEDENCE `planAgeingCutoffs` CHECKS IN: count, then range, then
  // order - so the toast on an invalid save names the same violation the
  // server would have, reusing its exact wording rather than a second one.
  const firstError = countIssue
    ? "cutoff_count"
    : rangeIssueIndex !== -1
      ? "cutoff_range"
      : orderIssueIndex !== -1
        ? "cutoffs_unordered"
        : null;

  // PER-ROW, for the input's own aria-invalid styling - which number is
  // wrong, not just that the list as a whole is.
  const rowInvalid = parsed.map((n, i) => {
    const outOfRange = !(Number.isInteger(n) && n >= 1 && n <= 3650);
    const outOfOrder = i > 0 && Number.isInteger(n) && Number.isInteger(parsed[i - 1]) && n <= parsed[i - 1];
    return outOfRange || outOfOrder;
  });
  // CUMULATIVE, for the band label beside each row - "31-60" only means what
  // it says if 30 above it actually held, so a row's own label goes quiet
  // (bandPlaceholder) the moment anything earlier in the list is wrong rather
  // than stating a range built on a broken assumption.
  const validPrefix: boolean[] = [];
  rowInvalid.forEach((bad, i) => {
    validPrefix[i] = !bad && (i === 0 ? true : validPrefix[i - 1]);
  });
  const allValid = rows.length > 0 && validPrefix[rows.length - 1] === true;

  const editRow = (i: number, value: string) =>
    setRows((prev) => prev.map((v, j) => (j === i ? value : v)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, j) => j !== i));
  const discard = () => setRows(initialRows);

  // INSERTED SORTED, not appended - array order doubles as day order
  // everywhere else in this component (the order check reads
  // `parsed[i-1]`), so a click at day 45 has to land between 30 and 60, not
  // after them.
  const insertCutoff = (value: number) => {
    if (rows.length >= MAX_CUTOFFS) return;
    const v = String(Math.min(3650, Math.max(1, Math.round(value))));
    setRows((prev) => {
      const idx = prev.findIndex((r) => Number(r) > Number(v) || Number.isNaN(Number(r)));
      const at = idx === -1 ? prev.length : idx;
      return [...prev.slice(0, at), v, ...prev.slice(at)];
    });
  };

  // THE RULER'S OWN SCALE. A row positions off its OWN number against the
  // largest one currently typed, floored at RULER_MIN_SCALE so a lone small
  // cutoff (or none yet) does not stretch across the whole bar.
  const finiteValues = parsed.filter((n) => Number.isFinite(n));
  const refMax = Math.max(RULER_MIN_SCALE, ...(finiteValues.length > 0 ? finiteValues : [0]));
  const boundedShare = 1 - RULER_OPEN_SHARE;
  const posPct = (n: number) =>
    Number.isFinite(n) ? (Math.min(refMax, Math.max(0, n)) / refMax) * boundedShare * 100 : 0;

  const trackClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!canWrite || pending) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const value = pct >= boundedShare * 100 ? refMax + RULER_MIN_SCALE : (pct / (boundedShare * 100)) * refMax;
    insertCutoff(value);
  };

  let segFrom = 1;
  const segments = allValid
    ? parsed.map((to, i) => {
        const seg = { key: i, from: segFrom, to, widthPct: posPct(to) - posPct(segFrom - 1) };
        segFrom = to + 1;
        return seg;
      })
    : [];

  const save = () => {
    // DISABLING SAVE WOULD ALSO DISABLE DISCARD - FormActions shares one
    // `pending` flag between both buttons, and an admin mid-typo still needs
    // a way back to the last-saved values. So the button stays clickable and
    // this guard refuses the attempt by name instead, the same as the server
    // would.
    if (firstError) {
      toast({ tone: "danger", title: AGEING_ERROR[firstError] });
      return;
    }
    start(async () => {
      const r = await onSave(parsed);
      toast(
        r.ok
          ? { tone: "success", title: AGEING_TEXT.saved }
          : { tone: "danger", title: AGEING_ERROR[r.error ?? "denied"] ?? r.error ?? "" },
      );
    });
  };

  return (
    <>
      <ViewHeader
        icon="clock-counter-clockwise"
        title={AGEING_TEXT.title}
        description={AGEING_TEXT.why}
        secondary={<Tag>{AGEING_TEXT.bandCount(cutoffs.length + 1)}</Tag>}
      />
      {/* INDENTED TO THE TITLE TEXT, not the icon - the same 80px
          (size-icon-2xl 48px + header gap-xl 32px) forecast-threshold-config
          uses, so content reads as belonging to "账龄分档" the text. */}
      <div className="pl-20">
        <Section>
          <Field>
            <FieldLabel>{AGEING_TEXT.cutoffsLabel}</FieldLabel>
            <div className="gap-xs flex items-center">
              <Tag>{DELIVERY_TEXT.ageingBand.not_due}</Tag>
            </div>
            {/* THE RULER IS THE INPUT. Track: click empty space to insert a
                cutoff there. Overlay: one Tag per cutoff at its own position -
                click the tag to remove it (no confirm - Discard already
                undoes everything in one click) - with its exact number
                editable in the small input right under it. */}
            <div className="mt-xs w-full">
              <div
                role="button"
                tabIndex={canWrite ? 0 : -1}
                aria-label={AGEING_TEXT.cutoffAdd}
                title={AGEING_TEXT.cutoffAdd}
                onClick={trackClick}
                className={`border-border flex h-10 w-full overflow-hidden rounded-md border ${canWrite && rows.length < MAX_CUTOFFS ? "cursor-pointer" : "cursor-default"}`}
              >
                {allValid
                  ? segments.map((s, i) => (
                      <div
                        key={s.key}
                        style={{ width: `${s.widthPct}%` }}
                        className={`text-label-sm flex shrink-0 items-center justify-center overflow-hidden px-2xs whitespace-nowrap ${RULER_BAND_TONES[i % RULER_BAND_TONES.length]}`}
                      >
                        {DELIVERY_TEXT.ageingBetween(s.from, s.to)}
                      </div>
                    ))
                  : <div style={{ width: `${boundedShare * 100}%` }} className="bg-muted shrink-0" />}
                <div
                  style={{ width: `${RULER_OPEN_SHARE * 100}%` }}
                  className="bg-muted text-label-sm text-muted-foreground flex shrink-0 items-center justify-center gap-2xs overflow-hidden px-2xs whitespace-nowrap"
                >
                  {allValid ? DELIVERY_TEXT.ageingOver(parsed[parsed.length - 1]) : AGEING_TEXT.bandPlaceholder}
                  <Icon name="arrow-right" size="xs" />
                </div>
              </div>
              <div className="relative mt-xs h-16 w-full">
                {rows.map((v, i) => (
                  <div
                    key={i}
                    className="gap-2xs absolute top-0 flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${posPct(parsed[i])}%` }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canWrite && rows.length > 1) removeRow(i);
                      }}
                      aria-label={AGEING_TEXT.cutoffRemove}
                      disabled={!canWrite || pending || rows.length <= 1}
                      className="disabled:pointer-events-none disabled:opacity-disabled"
                    >
                      <Tag tone={rowInvalid[i] ? "warning" : "neutral"}>{v || "?"}</Tag>
                    </button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="w-14 text-center"
                      value={v}
                      disabled={pending || !canWrite}
                      aria-invalid={rowInvalid[i]}
                      aria-label={AGEING_TEXT.cutoffsLabel}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => editRow(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="gap-xs mt-sm flex items-center">
              <Tag>{DELIVERY_TEXT.ageingBand.no_due_date}</Tag>
            </div>
            <FieldDescription>{AGEING_TEXT.cutoffsHint}</FieldDescription>
          </Field>
        </Section>
        {canWrite ? (
          <div className="mt-lg">
            <FormActions
              saveLabel={AGEING_TEXT.save}
              discardLabel={AGEING_TEXT.discard}
              onSave={save}
              onDiscard={discard}
              pending={pending || !dirty}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
