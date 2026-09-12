"use client";

import { useState, useTransition } from "react";
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
import { FormActions, FormFields } from "./form-page";
import { ageingBands } from "../../domains/delivery/lib/collection-stats";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

// 账龄分档 - where this workspace cuts an overdue receivable (incr/0042).
//
// WHY IT IS CONFIGURED AT ALL. `if (late <= 30) ... if (late <= 60)` was in the
// build, with the band names spelled out in the message catalogue beside it.
// 30/60 is one common ageing policy and 30/60/90 is another, and a company
// that ages at 45 days had no way to say so.
//
// THE PREVIEW IS THE POINT. A list of cutoffs is not what anybody thinks in -
// they think in bands - so the bands the numbers produce are drawn underneath,
// including the two that are always there: 未到期 and 未填到期日.
//
// ONE ROW PER CUTOFF, NOT ONE TEXT FIELD FOR ALL OF THEM (owner, 2026-09-12:
// 页面只有一条设置，但是涉及到多条内容). A comma-separated string asked the
// admin to hand-format a list and re-type the whole thing to fix one typo, and
// it had no per-value feedback - the same `line-editor.tsx`/`catalog-forms.tsx`
// shape (`useState<string[]>` + index-matched update, a row's own remove
// button, an add button below) replaces it here, one input per number.

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
  const usable = firstError === null;

  // PER-ROW, for the input's own aria-invalid styling - which number is
  // wrong, not just that the list as a whole is.
  const rowInvalid = parsed.map((n, i) => {
    const outOfRange = !(Number.isInteger(n) && n >= 1 && n <= 3650);
    const outOfOrder = i > 0 && Number.isInteger(n) && Number.isInteger(parsed[i - 1]) && n <= parsed[i - 1];
    return outOfRange || outOfOrder;
  });

  const editRow = (i: number, value: string) =>
    setRows((prev) => prev.map((v, j) => (j === i ? value : v)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, j) => j !== i));
  const addRow = () => setRows((prev) => [...prev, ""]);
  const discard = () => setRows(initialRows);

  const label = (b: ReturnType<typeof ageingBands>[number]) =>
    b.kind === "late"
      ? b.to === null
        ? DELIVERY_TEXT.ageingOver(b.from - 1)
        : DELIVERY_TEXT.ageingBetween(b.from, b.to)
      : DELIVERY_TEXT.ageingBand[b.kind];

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
          {/* THE CUTOFFS AND WHAT THEY PRODUCE, side by side: the preview is
              not a footnote to the input, it is the same statement in the
              form a person actually thinks in. */}
          <FormFields>
            <Field>
              <FieldLabel>{AGEING_TEXT.cutoffsLabel}</FieldLabel>
              <div className="gap-xs flex flex-col">
                {rows.map((v, i) => (
                  <div key={i} className="gap-xs flex items-center">
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="max-w-[8rem]"
                      value={v}
                      disabled={pending || !canWrite}
                      aria-invalid={rowInvalid[i]}
                      onChange={(e) => editRow(i, e.target.value)}
                    />
                    <span className="text-body-sm text-muted-foreground">{AGEING_TEXT.days}</span>
                    {canWrite && rows.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={AGEING_TEXT.cutoffRemove}
                        disabled={pending}
                        onClick={() => removeRow(i)}
                      >
                        <Icon name="x" size="xs" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              {canWrite ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-xs w-fit"
                  disabled={pending || rows.length >= MAX_CUTOFFS}
                  onClick={addRow}
                >
                  {AGEING_TEXT.cutoffAdd}
                </Button>
              ) : null}
              <FieldDescription>{AGEING_TEXT.cutoffsHint}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{AGEING_TEXT.previewLabel}</FieldLabel>
              <div className="gap-sm flex flex-wrap">
                {usable
                  ? ageingBands(parsed).map((b) => (
                      <Tag key={label(b)}>
                        {label(b)}
                      </Tag>
                    ))
                  : <span className="text-body-sm text-muted-foreground">{AGEING_TEXT.previewUnusable}</span>}
              </div>
              <FieldDescription>{AGEING_TEXT.previewHint}</FieldDescription>
            </Field>
          </FormFields>
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
