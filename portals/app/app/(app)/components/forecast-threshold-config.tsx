"use client";

import { Field, FieldDescription, FieldLabel, Icon, Input, Section } from "@vxture/design-ui";
import type { Dispatch, SetStateAction } from "react";
import type { ForecastThresholds } from "../../domains/pipeline/lib/forecast-rule";
import { FORECAST_LABEL } from "../lib/messages";
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
// COMMIT AND BEST-CASE ARE A RULER, NOT TWO FIELDS (owner, 2026-09-12:
// 预测预置的两个也是这种设置，按照这个可视化方式提供ui，两个保持松散，间隔
// 大一些 - the same treatment ageing-policy-config.tsx's cutoffs got). Both
// sit on the SAME 1-100 probability axis and the rule between them
// (bestCaseAt strictly under commitAt) is exactly the ageing ruler's
// ascending-cutoffs shape, just fixed at two points instead of a variable
// list - so no add/remove, no insert-by-click, no confirm bar: there is
// always exactly a 最好情况 threshold and a 承诺 threshold, editing is typing
// into the input that sits at each one's own position. The scale is bounded
// (0 to 100, not open-ended like days-overdue), so there is no "open tail"
// share to reserve either - the 承诺 zone IS the tail, ending at 100% on its
// own. 停滞天数 stays a plain field below - a different axis (days, not
// probability), unrelated to where these two sit.
const FORECAST_BAND_TONES = ["bg-primary/20", "bg-primary/35", "bg-primary/55"];

export type ForecastForm = { commitAt: string; bestCaseAt: string; stallDays: string };

// CONTROLLED, AND NO FormActions OF ITS OWN (incr/0063). This used to own its
// form state and its own Save/Discard bar; both moved up to
// opportunity-config-panel.tsx so /admin/opportunity's three form sections
// (this one, ageing, pricing) share ONE save bar instead of stacking three -
// see that file's own header for why. `firstForecastError` is exported so the
// panel's aggregate save can validate this section without duplicating the
// rule.
export function firstForecastError(commitAt: number, bestCaseAt: number, stallDays: number) {
  if (!(Number.isInteger(commitAt) && commitAt >= 1 && commitAt <= 100)) return "commit_out_of_range";
  if (!(Number.isInteger(bestCaseAt) && bestCaseAt >= 1 && bestCaseAt <= 100)) return "best_case_out_of_range";
  if (bestCaseAt >= commitAt) return "bands_cross";
  if (!(Number.isInteger(stallDays) && stallDays >= 1 && stallDays <= 365)) return "stall_out_of_range";
  return null;
}

export function ForecastThresholdConfig({
  thresholds,
  canWrite,
  form,
  onFormChange,
  pending,
}: {
  readonly thresholds: ForecastThresholds;
  readonly canWrite: boolean;
  readonly form: ForecastForm;
  readonly onFormChange: Dispatch<SetStateAction<ForecastForm>>;
  readonly pending: boolean;
}) {
  const { FORECAST_PARAM_TEXT } = useMessages();

  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  const parsed = {
    commitAt: num(form.commitAt),
    bestCaseAt: num(form.bestCaseAt),
    stallDays: num(form.stallDays),
  };

  const commitInvalid = !(Number.isInteger(parsed.commitAt) && parsed.commitAt >= 1 && parsed.commitAt <= 100);
  const bestCaseInvalid =
    !(Number.isInteger(parsed.bestCaseAt) && parsed.bestCaseAt >= 1 && parsed.bestCaseAt <= 100) ||
    (!commitInvalid && parsed.bestCaseAt >= parsed.commitAt);
  const bandsValid = !commitInvalid && !bestCaseInvalid;

  return (
    <Section
      icon="trend-up"
      title={FORECAST_PARAM_TEXT.title}
      description={FORECAST_PARAM_TEXT.why}
      action={<Tag>{FORECAST_PARAM_TEXT.ladder(thresholds.bestCaseAt, thresholds.commitAt)}</Tag>}
    >
      {/* INDENTED TO THE TITLE TEXT, not the icon - the same device
          vocabulary-config.tsx's own Section branch uses for 赢丢原因/商机
          类型/商机阶段: an invisible icon-sized spacer keeps this content
          column aligned with "预测阈值" the text, not the section's raw left
          edge, so every stacked block on this page reads at the same level. */}
      <div className="gap-lg flex">
        <span className="invisible shrink-0" aria-hidden="true">
          <Icon name="trend-up" size="lg" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-md">
          <Field>
            <FieldLabel>{FORECAST_PARAM_TEXT.thresholdsLabel}</FieldLabel>
            <div className="relative mt-xs w-full">
              <div className="border-border flex h-10 w-full overflow-hidden rounded-md border">
                {bandsValid ? (
                  <>
                    <div
                      style={{ width: `${parsed.bestCaseAt}%` }}
                      className={`border-border text-label-sm flex shrink-0 items-center justify-center overflow-hidden border-r px-2xs whitespace-nowrap ${FORECAST_BAND_TONES[0]}`}
                    >
                      {FORECAST_LABEL.pipeline}
                    </div>
                    <div
                      style={{ width: `${parsed.commitAt - parsed.bestCaseAt}%` }}
                      className={`border-border text-label-sm flex shrink-0 items-center justify-center overflow-hidden border-r px-2xs whitespace-nowrap ${FORECAST_BAND_TONES[1]}`}
                    >
                      {FORECAST_LABEL.best_case}
                    </div>
                    <div
                      style={{ width: `${100 - parsed.commitAt}%` }}
                      className={`text-label-sm flex shrink-0 items-center justify-center overflow-hidden px-2xs whitespace-nowrap ${FORECAST_BAND_TONES[2]}`}
                    >
                      {FORECAST_LABEL.commit}
                    </div>
                  </>
                ) : (
                  <div className="bg-muted w-full" />
                )}
              </div>
              <div className="relative mt-xs h-10 w-full">
                <div
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: `${Math.min(100, Math.max(0, parsed.bestCaseAt || 0))}%` }}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-control-xs w-16 text-center [&::-webkit-inner-spin-button]:opacity-100 [&::-webkit-outer-spin-button]:opacity-100"
                    value={form.bestCaseAt}
                    disabled={pending || !canWrite}
                    aria-invalid={bestCaseInvalid}
                    aria-label={FORECAST_PARAM_TEXT.bestCaseLabel}
                    onChange={(e) => onFormChange((f) => ({ ...f, bestCaseAt: e.target.value }))}
                  />
                </div>
                <div
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: `${Math.min(100, Math.max(0, parsed.commitAt || 0))}%` }}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-control-xs w-16 text-center [&::-webkit-inner-spin-button]:opacity-100 [&::-webkit-outer-spin-button]:opacity-100"
                    value={form.commitAt}
                    disabled={pending || !canWrite}
                    aria-invalid={commitInvalid}
                    aria-label={FORECAST_PARAM_TEXT.commitLabel}
                    onChange={(e) => onFormChange((f) => ({ ...f, commitAt: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <FieldDescription>{FORECAST_PARAM_TEXT.thresholdsHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="fc-stallDays">{FORECAST_PARAM_TEXT.stallLabel}</FieldLabel>
            <div className="gap-sm flex items-center">
              <Input
                id="fc-stallDays"
                type="number"
                inputMode="numeric"
                className="max-w-[8rem]"
                value={form.stallDays}
                disabled={pending || !canWrite}
                aria-invalid={!(Number.isInteger(parsed.stallDays) && parsed.stallDays >= 1 && parsed.stallDays <= 365)}
                onChange={(e) => onFormChange((f) => ({ ...f, stallDays: e.target.value }))}
              />
              <span className="text-body-sm text-muted-foreground">{FORECAST_PARAM_TEXT.days}</span>
            </div>
            <FieldDescription>{FORECAST_PARAM_TEXT.stallHint}</FieldDescription>
          </Field>
        </div>
      </div>
    </Section>
  );
}
