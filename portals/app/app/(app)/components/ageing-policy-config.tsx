"use client";

import { useState, useTransition, type MouseEvent } from "react";
import {
  Button,
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
// CLICK THE BAR TO INSERT, CLICK "-" TO REMOVE (owner, 2026-09-12, third
// pass then a correction: 做成标签式游标，点击可以插入式增加和删除，下面数字
// 可设置数字，第一版按「由于复原简单，增删都无需确认」做成即时生效；第四版
// 改了主意 - 给一条虚线定位并显示数字，点击后还是确认一下再添加，删除也要
// 同一个确认). A click - the track, or a row's own "-" - never writes to
// `rows` directly any more: it only stages a `pendingAction`, which the
// dashed marker (insert) or the confirm bar under the ruler renders, and
// only confirming there commits it. Also settled: one number per cutoff, not
// two - a `Tag` sitting above its own `Input` read as the same value shown
// twice ("现在有两个太搞笑了"), so the Input alone carries it now (native
// spin buttons on, so typing or clicking them both work), with "-" behind it
// rather than a whole second control above it.
//
// 未到期 MOVED INTO THE BAR, 未填到期日 STAYS OUTSIDE IT (owner, 2026-09-12:
// 把未到期加入到进度条中，从1开始逾期 / 底部显示未填到期日，什么意思和逻辑，
// 这里能填吗). The two are not the same kind of exception: 未到期 is "before
// the clock starts", which is a position ON the ageing axis (the leftmost
// one), so it is now the bar's own leading segment - a fixed share, since it
// has no day count to be proportional to, but still a place on the ruler.
// 未填到期日 is not a position on that axis at all - the due-date field is
// empty, so there is no clock to have started or not, nothing this page's
// cutoffs could ever place it relative to.
//
// 未填到期日 DOES NOT APPEAR ON THIS PAGE AT ALL, TWO CORRECTIONS LATER
// (owner, 2026-09-12: first 这条为什么要在这里，这里是配置，不是应用 dropped
// the sentence explaining what it means; then 这个裸标签是什么意图，为什么
// 要，其存在价值 asked what the bare tag itself was still doing there once
// the sentence was gone). Nothing was left for it to say: `why` in the
// ViewHeader description already states once, in one place, that 未到期 and
// 未填到期日 are always their own bands - a second, silent, unclickable tag
// repeating half of that sentence was not completeness, it was the leftover
// shape of the old "two tags bracket the ruler" layout after 未到期 moved
// into the bar and took its half of the pairing with it.
//
// THE HINT MOVED TO SIT UNDER THE RULER (owner, 2026-09-12: 说明进行放到哪里
// 合适) - `cutoffsHint` describes the numbers this control takes (ascending,
// 1-3650, up to five), and it used to render at the very bottom of the
// Field, after 未填到期日, which is not the numbers this control takes.
// 未到期 IS NOW A SEGMENT OF THE BAR TOO (owner, 2026-09-12: 把未到期加入到
// 进度条中，从1开始逾期), a fixed share on the LEFT the same way the
// open-ended tail is a fixed share on the right - neither has a day count to
// be proportional to, one because it is "before the clock starts" and the
// other because it never ends. 逾期 STILL COUNTS FROM DAY 1 the moment it
// starts (unchanged) - 未到期 only claims the room to its left, it does not
// shift where the numbered bands begin. That zone is real estate, not a
// value: `valueFromClientX` returns null for a click or hover landing in it,
// since there is no day number a click there could mean.
const RULER_NOT_DUE_SHARE = 0.14;
const RULER_OPEN_SHARE = 0.22;
const RULER_MIN_SCALE = 30;
// STRONG ENOUGH TO READ AT INDEX 0, AND EVERY SEAM HAS A BORDER TOO (owner,
// 2026-09-12: 当前未到期和1-X 同色了 / 只有一个当时，前后颜色也同色了，看不出
// 来分界). /10 read as indistinguishable from the neutral bg-muted either
// side of it - the fix is two things together, not just a darker ramp: the
// tones start visibly saturated, AND every segment carries its own
// `border-r` so a boundary is never resting on colour contrast alone (a
// single-cutoff ruler has exactly this shape - 未到期 | one band | the open
// tail - where two muted neighbours would otherwise read as one field).
const RULER_BAND_TONES = ["bg-primary/20", "bg-primary/30", "bg-primary/40", "bg-primary/50", "bg-primary/60"];

/** A stable identity per cutoff, since insert splices into the middle of the
 *  array (not just appends/removes like line-editor.tsx's rows) - an index
 *  key would let React reattach an input's DOM state to the wrong cutoff the
 *  moment one gets inserted ahead of it. */
type CutoffRow = { readonly id: string; readonly value: string };
const toRows = (values: readonly string[]): CutoffRow[] =>
  values.map((value) => ({ id: crypto.randomUUID(), value }));

// SAME PRECEDENCE `planAgeingCutoffs` CHECKS IN: count, then range, then
// order - so the toast on an invalid save names the same violation the
// server would have, reusing its exact wording rather than a second one.
// WRITTEN AS if/else, NOT A NESTED TERNARY - the three-deep chain that used
// to live inline here is exactly SonarCloud's "nested ternary" complaint,
// and pulling it out to its own function is what let the caller stay
// readable without it.
function firstAgeingError(rowCount: number, parsed: readonly number[], maxCutoffs: number) {
  if (rowCount < 1 || rowCount > maxCutoffs) return "cutoff_count";
  if (parsed.some((n) => !(Number.isInteger(n) && n >= 1 && n <= 3650))) return "cutoff_range";
  if (parsed.some((n, i) => i > 0 && Number.isInteger(n) && Number.isInteger(parsed[i - 1]) && n <= parsed[i - 1])) {
    return "cutoffs_unordered";
  }
  return null;
}

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
  const initialRows = toRows(cutoffs.length > 0 ? cutoffs.map(String) : [""]);
  const [rows, setRows] = useState<readonly CutoffRow[]>(initialRows);
  const [pendingAction, setPendingAction] = useState<
    { readonly kind: "insert"; readonly value: number } | { readonly kind: "remove"; readonly id: string; readonly value: string } | null
  >(null);
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const { toast } = useToast();

  // Whatever they typed, as numbers. Anything unparseable becomes NaN, and a
  // row carrying one is flagged rather than silently dropped - the rule
  // refuses it by name rather than this component guessing.
  const parsed = rows.map((r) => (r.value.trim() === "" ? Number.NaN : Number(r.value)));
  const dirty = parsed.join(",") !== cutoffs.join(",");

  const MAX_CUTOFFS = 5;
  const firstError = firstAgeingError(rows.length, parsed, MAX_CUTOFFS);

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

  const editRow = (id: string, value: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const discard = () => {
    setRows(initialRows);
    setPendingAction(null);
    setHoverValue(null);
  };

  // INSERTED SORTED, not appended - array order doubles as day order
  // everywhere else in this component (the order check reads
  // `parsed[i-1]`), so a click at day 45 has to land between 30 and 60, not
  // after them.
  const insertCutoff = (value: number) => {
    if (rows.length >= MAX_CUTOFFS) return;
    const v = String(Math.min(3650, Math.max(1, Math.round(value))));
    setRows((prev) => {
      const idx = prev.findIndex((r) => Number(r.value) > Number(v) || Number.isNaN(Number(r.value)));
      const at = idx === -1 ? prev.length : idx;
      return [...prev.slice(0, at), { id: crypto.randomUUID(), value: v }, ...prev.slice(at)];
    });
  };

  // THE RULER'S OWN SCALE. A row positions off its OWN number against the
  // largest one currently typed, floored at RULER_MIN_SCALE so a lone small
  // cutoff (or none yet) does not stretch across the whole bar. The numbered
  // region sits between the fixed 未到期 share on the left and the fixed
  // open-tail share on the right.
  const finiteValues = parsed.filter((n) => Number.isFinite(n));
  const refMax = Math.max(RULER_MIN_SCALE, ...(finiteValues.length > 0 ? finiteValues : [0]));
  const boundedShare = 1 - RULER_NOT_DUE_SHARE - RULER_OPEN_SHARE;
  const posPct = (n: number) =>
    Number.isFinite(n)
      ? RULER_NOT_DUE_SHARE * 100 + (Math.min(refMax, Math.max(0, n)) / refMax) * boundedShare * 100
      : 0;

  // THE SAME MATH FOR HOVER AND CLICK, so the number a click stages is
  // exactly the number the hover preview just promised. Returns null for a
  // click/hover landing in the 未到期 zone - there is no day it could mean.
  const valueFromClientX = (clientX: number, rect: DOMRect): number | null => {
    const pct = ((clientX - rect.left) / rect.width) * 100;
    if (pct < RULER_NOT_DUE_SHARE * 100) return null;
    if (pct >= (RULER_NOT_DUE_SHARE + boundedShare) * 100) return refMax + RULER_MIN_SCALE;
    return Math.round(((pct - RULER_NOT_DUE_SHARE * 100) / (boundedShare * 100)) * refMax);
  };

  // STAGES, DOES NOT COMMIT (owner, 2026-09-12: 给一条虚线定位并显示数字，
  // 点击后还是确认一下再添加 / 点击删除...需要确认框，==同增加 - then a
  // correction: 在hover 时就显示并带数字，点击后确认，现在点击根本不知道点到
  // 哪里了). The dashed marker now follows the pointer on hover
  // (`hoverValue`, cleared on leave) so a click lands where it was already
  // shown to land, rather than only revealing the position after the fact.
  // Clicking (or an Enter/Space activation, which has no real hover to have
  // shown anything) is what turns that preview into a `pendingAction`; the
  // confirm bar under the ruler is still the only thing that writes to
  // `rows`.
  const trackHover = (e: MouseEvent<HTMLButtonElement>) => {
    if (pendingAction || !canWrite || pending) return;
    setHoverValue(valueFromClientX(e.clientX, e.currentTarget.getBoundingClientRect()));
  };
  const trackLeave = () => setHoverValue(null);
  const trackClick = (e: MouseEvent<HTMLButtonElement>) => {
    // A REAL BUTTON MEANS A KEYBOARD ACTIVATION FIRES THIS TOO (Enter/Space),
    // and a synthetic click has no meaningful clientX - `detail === 0` is the
    // standard way to tell it apart from an actual pointer click, so a
    // keyboard user gets the same "extend past the last cutoff" default a
    // click past the open tail gets, not a position computed from nothing.
    const value =
      e.detail === 0 ? refMax + RULER_MIN_SCALE : valueFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
    setHoverValue(null);
    // null = the click landed in the 未到期 zone, which stages nothing.
    if (value !== null) setPendingAction({ kind: "insert", value });
  };
  const stageRemoval = (id: string, value: string) => setPendingAction({ kind: "remove", id, value });
  const confirmPendingAction = () => {
    if (pendingAction?.kind === "insert") insertCutoff(pendingAction.value);
    else if (pendingAction?.kind === "remove") removeRow(pendingAction.id);
    setPendingAction(null);
  };
  const cancelPendingAction = () => setPendingAction(null);

  const ghostInsertValue = pendingAction?.kind === "insert" ? pendingAction.value : hoverValue;

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
            {/* THE RULER IS THE INPUT. 未到期 is now the bar's own leading
                segment (fixed share, not a day value - clicks there stage
                nothing). Track: click empty space in the numbered region to
                STAGE a cutoff there (a dashed marker previews it, nothing
                written to `rows` yet). Overlay: one number input per cutoff
                at its own position, spinners on to say it is adjustable, a
                "-" behind it to STAGE that cutoff's removal. Either stage
                only resolves through the confirm bar underneath. */}
            <div className="relative mt-xs w-full">
              <button
                type="button"
                aria-label={AGEING_TEXT.cutoffAdd}
                title={AGEING_TEXT.cutoffAdd}
                onClick={trackClick}
                onMouseMove={trackHover}
                onMouseLeave={trackLeave}
                disabled={!canWrite || pending || rows.length >= MAX_CUTOFFS}
                className={`border-border flex h-10 w-full overflow-hidden rounded-md border ${canWrite && rows.length < MAX_CUTOFFS ? "cursor-pointer" : "cursor-default"}`}
              >
                <div
                  style={{ width: `${RULER_NOT_DUE_SHARE * 100}%` }}
                  className="border-border bg-muted text-label-sm text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden border-r px-2xs whitespace-nowrap"
                >
                  {DELIVERY_TEXT.ageingBand.not_due}
                </div>
                {allValid
                  ? segments.map((s, i) => (
                      <div
                        key={s.key}
                        style={{ width: `${s.widthPct}%` }}
                        className={`border-border text-label-sm flex shrink-0 items-center justify-center overflow-hidden border-r px-2xs whitespace-nowrap ${RULER_BAND_TONES[i % RULER_BAND_TONES.length]}`}
                      >
                        {DELIVERY_TEXT.ageingBetween(s.from, s.to)}
                      </div>
                    ))
                  : <div style={{ width: `${boundedShare * 100}%` }} className="border-border bg-muted shrink-0 border-r" />}
                <div
                  style={{ width: `${RULER_OPEN_SHARE * 100}%` }}
                  className="bg-muted text-label-sm text-muted-foreground flex shrink-0 items-center justify-center gap-2xs overflow-hidden px-2xs whitespace-nowrap"
                >
                  {allValid ? DELIVERY_TEXT.ageingOver(parsed[parsed.length - 1]) : AGEING_TEXT.bandPlaceholder}
                  <Icon name="arrow-right" size="xs" />
                </div>
              </button>
              <div className="relative mt-xs h-10 w-full">
                {rows.map((r, i) => (
                  <div
                    key={r.id}
                    className="gap-2xs z-0 absolute top-0 flex -translate-x-1/2 items-center"
                    style={{ left: `${posPct(parsed[i])}%` }}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-control-xs w-16 text-center [&::-webkit-inner-spin-button]:opacity-100 [&::-webkit-outer-spin-button]:opacity-100"
                      value={r.value}
                      disabled={pending || !canWrite}
                      aria-invalid={rowInvalid[i]}
                      aria-label={AGEING_TEXT.cutoffsLabel}
                      onChange={(e) => editRow(r.id, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      onClick={() => stageRemoval(r.id, r.value)}
                      aria-label={AGEING_TEXT.cutoffRemove}
                      disabled={!canWrite || pending || rows.length <= 1}
                    >
                      <Icon name="minus" size="xs" />
                    </Button>
                  </div>
                ))}
                {/* HOVER PREVIEWS, A CLICK STAGES (owner, 2026-09-12: 在
                    hover 时就显示并带数字，点击后确认，现在点击根本不知道
                    点到哪里了 - then a layout correction: 说明文字与hover数字
                    重合，把数字提升，虚线应该在进度条上可以上下出血，数字要
                    和已有数字对齐、更上层显示，可遮挡其他数字). The number
                    lives IN this row (same container as the real Input rows,
                    `z-10` over their `z-0` - it is allowed to sit on top of
                    one, never the other way round) so it lands on the exact
                    baseline the real numbers already read at, instead of
                    stacking below a full-height line and overflowing into
                    `cutoffsHint` underneath this whole block. The dashed
                    line is the SEPARATE span below, scoped to the outer
                    wrapper so it can bleed slightly past the bar's top and
                    this row's bottom without affecting this row's own
                    height. */}
                {ghostInsertValue !== null ? (
                  <div
                    className={`pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 items-center ${pendingAction ? "" : "opacity-70"}`}
                    style={{ left: `${posPct(ghostInsertValue)}%` }}
                  >
                    <span className="bg-background border-border shadow-raised text-label-xs text-foreground rounded-sm border px-2xs py-2xs tabular-nums">
                      {ghostInsertValue}
                    </span>
                  </div>
                ) : null}
              </div>
              {ghostInsertValue !== null ? (
                <span
                  className={`border-muted-foreground pointer-events-none absolute -top-1 -bottom-1 border-l border-dashed ${pendingAction ? "" : "opacity-70"}`}
                  style={{ left: `${posPct(ghostInsertValue)}%` }}
                />
              ) : null}
            </div>
            {/* THE RULE FOR THIS CONTROL, RIGHT UNDER THE CONTROL (owner,
                2026-09-12: 说明进行放到哪里合适 - this used to sit at the
                very bottom of the Field, after 未填到期日, which describes
                something this hint has nothing to do with). */}
            <FieldDescription>{AGEING_TEXT.cutoffsHint}</FieldDescription>
            {pendingAction ? (
              <div className="gap-sm border-border bg-card mt-xs flex items-center rounded-md border border-dashed p-sm">
                <span className="text-body-sm">
                  {pendingAction.kind === "insert"
                    ? AGEING_TEXT.confirmAdd(pendingAction.value)
                    : AGEING_TEXT.confirmRemove(pendingAction.value || "?")}
                </span>
                <Button size="sm" onClick={confirmPendingAction}>
                  {AGEING_TEXT.confirmYes}
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelPendingAction}>
                  {AGEING_TEXT.confirmNo}
                </Button>
              </div>
            ) : null}
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
