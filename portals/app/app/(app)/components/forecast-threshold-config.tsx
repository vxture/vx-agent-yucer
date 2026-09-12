"use client";

import { useState, useTransition } from "react";
import {
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Section,
  ViewHeader,
  useToast,
} from "@vxture/design-ui";
import { FormActions, FormFields } from "./form-page";
import type { ForecastThresholds } from "../../domains/pipeline/lib/forecast-rule";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

// 预测阈值 - where this workspace's confidence bands start (incr/0041).
//
// WHY IT IS CONFIGURED AT ALL. These were three constants in the build, and
// they decide what a forecast review tells a sales leader the book is worth.
// 80 for commit is defensible and so is 90; nothing in the product branches on
// the number, and two workspaces that disagree about it are both right about
// themselves.
//
// A FORM, NOT A TABLE, because this is not a list: one workspace has one set
// of thresholds, and the three numbers are read together or not at all. The
// preview under them is the point - a percentage means nothing until you see
// which band a deal at 65% lands in.

export function ForecastThresholdConfig({
  thresholds,
  canWrite,
  onSave,
}: {
  readonly thresholds: ForecastThresholds;
  readonly canWrite: boolean;
  readonly onSave: (input: ForecastThresholds) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { FORECAST_PARAM_ERROR, FORECAST_PARAM_TEXT } = useMessages();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    commitAt: String(thresholds.commitAt),
    bestCaseAt: String(thresholds.bestCaseAt),
    stallDays: String(thresholds.stallDays),
  });
  const { toast } = useToast();

  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  const parsed = {
    commitAt: num(form.commitAt),
    bestCaseAt: num(form.bestCaseAt),
    stallDays: num(form.stallDays),
  };
  const dirty =
    parsed.commitAt !== thresholds.commitAt ||
    parsed.bestCaseAt !== thresholds.bestCaseAt ||
    parsed.stallDays !== thresholds.stallDays;

  const save = () =>
    start(async () => {
      const r = await onSave(parsed);
      toast(
        r.ok
          ? { tone: "success", title: FORECAST_PARAM_TEXT.saved }
          : {
              tone: "danger",
              title: FORECAST_PARAM_ERROR[r.error ?? "denied"] ?? r.error ?? "",
            },
      );
    });

  const discard = () =>
    setForm({
      commitAt: String(thresholds.commitAt),
      bestCaseAt: String(thresholds.bestCaseAt),
      stallDays: String(thresholds.stallDays),
    });

  const field = (
    key: keyof typeof form,
    label: string,
    hint: string,
    suffix: string,
  ) => (
    <Field>
      <FieldLabel htmlFor={`fc-${key}`}>{label}</FieldLabel>
      <div className="gap-sm flex items-center">
        <Input
          id={`fc-${key}`}
          type="number"
          inputMode="numeric"
          className="max-w-[8rem]"
          value={form[key]}
          disabled={pending || !canWrite}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
        <span className="text-body-sm text-muted-foreground">{suffix}</span>
      </div>
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  );

  return (
    <>
      <ViewHeader
        icon="trend-up"
        title={FORECAST_PARAM_TEXT.title}
        description={FORECAST_PARAM_TEXT.why}
        secondary={
          <Tag>
            {FORECAST_PARAM_TEXT.ladder(thresholds.bestCaseAt, thresholds.commitAt)}
          </Tag>
        }
      />
      {/* INDENTED TO THE TITLE TEXT, not the icon: ViewHeader's icon
          (size-icon-2xl, 48px) plus its gap-xl (32px) to the title is the
          same 80px a nested H2 would sit under, so the content below reads
          as belonging to "预测阈值" the text, not to the icon column. */}
      <div className="pl-20">
        <Section>
          {/* TWO TO A ROW, evenly (owner, 2026-09-09). The commit and
              best-case thresholds are one decision read together, so they
              sit side by side; the stall clock is a different question and
              takes the next row on its own rather than being padded out to
              fill this one. */}
          <FormFields>
            {field(
              "commitAt",
              FORECAST_PARAM_TEXT.commitLabel,
              FORECAST_PARAM_TEXT.commitHint,
              FORECAST_PARAM_TEXT.percent,
            )}
            {field(
              "bestCaseAt",
              FORECAST_PARAM_TEXT.bestCaseLabel,
              FORECAST_PARAM_TEXT.bestCaseHint,
              FORECAST_PARAM_TEXT.percent,
            )}
            {field(
              "stallDays",
              FORECAST_PARAM_TEXT.stallLabel,
              FORECAST_PARAM_TEXT.stallHint,
              FORECAST_PARAM_TEXT.days,
            )}
          </FormFields>
        </Section>
        {canWrite ? (
          <div className="mt-lg">
            <FormActions
              saveLabel={FORECAST_PARAM_TEXT.save}
              discardLabel={FORECAST_PARAM_TEXT.discard}
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
