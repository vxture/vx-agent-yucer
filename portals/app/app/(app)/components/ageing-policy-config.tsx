"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Section,
  ViewHeader,
  useToast,
} from "@vxture/design-ui";
import { FormFields } from "./form-page";
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
  const [text, setText] = useState(cutoffs.join(", "));
  const { toast } = useToast();

  // Whatever they typed, as numbers. Anything unparseable becomes NaN and the
  // rule refuses it by name rather than this component guessing.
  const parsed = text
    .split(/[,，\s]+/)
    .filter((p) => p !== "")
    .map(Number);
  const dirty = parsed.join(",") !== cutoffs.join(",");
  const usable = parsed.length > 0 && parsed.every((n) => Number.isInteger(n) && n > 0);

  const label = (b: ReturnType<typeof ageingBands>[number]) =>
    b.kind === "late"
      ? b.to === null
        ? DELIVERY_TEXT.ageingOver(b.from - 1)
        : DELIVERY_TEXT.ageingBetween(b.from, b.to)
      : DELIVERY_TEXT.ageingBand[b.kind];

  const save = () =>
    start(async () => {
      const r = await onSave(parsed);
      toast(
        r.ok
          ? { tone: "success", title: AGEING_TEXT.saved }
          : { tone: "danger", title: AGEING_ERROR[r.error ?? "denied"] ?? r.error ?? "" },
      );
    });

  return (
    <>
      <ViewHeader
        icon="clock-counter-clockwise"
        title={AGEING_TEXT.title}
        description={AGEING_TEXT.why}
        secondary={<Tag>{AGEING_TEXT.bandCount(cutoffs.length + 1)}</Tag>}
        action={
          canWrite ? (
            <Button onClick={save} disabled={pending || !dirty || !usable}>
              {AGEING_TEXT.save}
            </Button>
          ) : null
        }
      />
      <Section>
        {/* THE CUTOFFS AND WHAT THEY PRODUCE, side by side: the preview is not
            a footnote to the input, it is the same statement in the form a
            person actually thinks in. */}
        <FormFields>
          <Field>
            <FieldLabel htmlFor="ageing-cutoffs">{AGEING_TEXT.cutoffsLabel}</FieldLabel>
            <Input
              id="ageing-cutoffs"
              className="max-w-[16rem]"
              value={text}
              disabled={pending || !canWrite}
              onChange={(e) => setText(e.target.value)}
            />
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
    </>
  );
}
