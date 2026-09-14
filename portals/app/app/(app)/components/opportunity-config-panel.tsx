"use client";

import { useState, useTransition } from "react";
import { useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { FormActions } from "./form-page";
import {
  ForecastThresholdConfig,
  firstForecastError,
  type ForecastForm,
} from "./forecast-threshold-config";
import {
  AgeingPolicyConfig,
  firstAgeingError,
  toRows,
  type CutoffRow,
  type PendingCutoffAction,
} from "./ageing-policy-config";
import { PricingPolicyConfig } from "./pricing-policy-config";
import type { ForecastThresholds } from "../../domains/pipeline/lib/forecast-rule";
import type { PricingPolicy } from "../../domains/catalog/lib/pricing-policy";

// /admin/opportunity's three FORM sections - 预测阈值/账龄分档/计价货币 -
// share ONE save bar (owner, 2026-09-13: 底部的保存操作栏出现了好多次).
//
// WHY A NEW CLIENT COMPONENT, NOT THREE SEPARATE ONES ANY MORE. Each of the
// three used to own its own form state, its own useTransition, and render its
// own <FormActions>. Stacked on one page that read as the same bar
// repeating three times, once per section, each independently permissioned.
// This component is the ONLY thing that changed shape to fix it: it owns the
// three pieces of editable state (moved verbatim out of the leaves - see each
// leaf's own file header), and renders ONE trailing <FormActions> after all
// three sections instead. 商机类型/商机阶段/赢丢原因 are NOT here - they save
// per row through their own dialog, never had a bottom bar, and are
// unaffected.
//
// SEQUENTIAL SAVE, NOT Promise.all. Three unrelated domain actions (pipeline
// forecast / delivery ageing / catalog pricing) - sequential keeps the toast
// order matching the sections' own order top to bottom, which is easier to
// read than three toasts landing in whatever order their requests happened
// to resolve.
//
// VALIDATION BLOCKS THE WHOLE CLICK, THE SAME WAY EACH LEAF USED TO BLOCK
// ITS OWN. A dirty section with an invalid value stops the save entirely
// (toast, no request sent) rather than the new "validate everything, report
// every violation" interaction nobody asked for - each leaf's own
// `firstForecastError`/`firstAgeingError` is reused unchanged so the message
// is the same one the server would have given.
//
// NO MANUAL RESYNC AFTER A PARTIAL SUCCESS. Each of the three server actions
// still calls `revalidatePath("/admin/opportunity")` on its own success, so
// Next re-renders the page and this component gets fresh `forecast`/
// `ageing`/`pricing` props. `dirty` is computed every render straight off
// those props (never a value frozen at mount), so a section that just saved
// goes clean on its own and a section that failed keeps showing the rejected
// edit - identical to how the three leaves behaved standalone.
export function OpportunityConfigPanel({
  canManage,
  forecast,
  ageing,
  pricing,
}: {
  readonly canManage: boolean;
  readonly forecast: {
    readonly thresholds: ForecastThresholds;
    readonly onSave: (input: ForecastThresholds) => Promise<{ ok: boolean; error?: string }>;
  } | null;
  readonly ageing: {
    readonly cutoffs: readonly number[];
    readonly onSave: (cutoffs: readonly number[]) => Promise<{ ok: boolean; error?: string }>;
  } | null;
  readonly pricing: {
    readonly policy: PricingPolicy;
    readonly onSave: (input: PricingPolicy) => Promise<{ ok: boolean; error?: string }>;
  } | null;
}) {
  const { ADMIN_TEXT, FORECAST_PARAM_ERROR, FORECAST_PARAM_TEXT, AGEING_ERROR, AGEING_TEXT, PRICING_ERROR, PRICING_TEXT } =
    useMessages();
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const initialForecastForm = (t: ForecastThresholds): ForecastForm => ({
    commitAt: String(t.commitAt),
    bestCaseAt: String(t.bestCaseAt),
    stallDays: String(t.stallDays),
  });
  const [forecastForm, setForecastForm] = useState<ForecastForm>(
    forecast ? initialForecastForm(forecast.thresholds) : { commitAt: "", bestCaseAt: "", stallDays: "" },
  );
  const [currency, setCurrency] = useState(pricing?.policy.defaultCurrency ?? "");
  const initialAgeingRows = (cutoffs: readonly number[]): readonly CutoffRow[] =>
    toRows(cutoffs.length > 0 ? cutoffs.map(String) : [""]);
  const [ageingRows, setAgeingRows] = useState<readonly CutoffRow[]>(
    ageing ? initialAgeingRows(ageing.cutoffs) : toRows([""]),
  );
  const [ageingPendingAction, setAgeingPendingAction] = useState<PendingCutoffAction | null>(null);
  const [ageingHoverValue, setAgeingHoverValue] = useState<number | null>(null);

  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  const forecastParsed = {
    commitAt: num(forecastForm.commitAt),
    bestCaseAt: num(forecastForm.bestCaseAt),
    stallDays: num(forecastForm.stallDays),
  };
  const forecastDirty =
    !!forecast &&
    canManage &&
    (forecastParsed.commitAt !== forecast.thresholds.commitAt ||
      forecastParsed.bestCaseAt !== forecast.thresholds.bestCaseAt ||
      forecastParsed.stallDays !== forecast.thresholds.stallDays);
  const forecastError = forecast
    ? firstForecastError(forecastParsed.commitAt, forecastParsed.bestCaseAt, forecastParsed.stallDays)
    : null;

  const pricingDirty = !!pricing && canManage && currency !== pricing.policy.defaultCurrency;

  const ageingParsed = ageingRows.map((r) => (r.value.trim() === "" ? Number.NaN : Number(r.value)));
  const ageingDirty = !!ageing && canManage && ageingParsed.join(",") !== ageing.cutoffs.join(",");
  const ageingError = ageing ? firstAgeingError(ageingRows.length, ageingParsed, 5) : null;

  const anyDirty = forecastDirty || pricingDirty || ageingDirty;

  const save = () => {
    if (forecastDirty && forecastError) {
      toast({ tone: "danger", title: FORECAST_PARAM_ERROR[forecastError] });
      return;
    }
    if (ageingDirty && ageingError) {
      toast({ tone: "danger", title: AGEING_ERROR[ageingError] });
      return;
    }
    start(async () => {
      if (forecastDirty && forecast) {
        const r = await forecast.onSave(forecastParsed);
        toast(
          r.ok
            ? { tone: "success", title: FORECAST_PARAM_TEXT.saved }
            : { tone: "danger", title: FORECAST_PARAM_ERROR[r.error ?? "denied"] ?? r.error ?? "" },
        );
      }
      if (ageingDirty && ageing) {
        const r = await ageing.onSave(ageingParsed);
        toast(
          r.ok
            ? { tone: "success", title: AGEING_TEXT.saved }
            : { tone: "danger", title: AGEING_ERROR[r.error ?? "denied"] ?? r.error ?? "" },
        );
      }
      if (pricingDirty && pricing) {
        const r = await pricing.onSave({ defaultCurrency: currency });
        toast(
          r.ok
            ? { tone: "success", title: PRICING_TEXT.saved }
            : { tone: "danger", title: PRICING_ERROR[r.error ?? "denied"] ?? r.error ?? "" },
        );
      }
    });
  };

  const discard = () => {
    if (forecast) setForecastForm(initialForecastForm(forecast.thresholds));
    if (pricing) setCurrency(pricing.policy.defaultCurrency);
    if (ageing) {
      setAgeingRows(initialAgeingRows(ageing.cutoffs));
      setAgeingPendingAction(null);
      setAgeingHoverValue(null);
    }
  };

  return (
    <>
      {forecast ? (
        <ForecastThresholdConfig
          thresholds={forecast.thresholds}
          canWrite={canManage}
          form={forecastForm}
          onFormChange={setForecastForm}
          pending={pending}
        />
      ) : null}
      {ageing ? (
        <AgeingPolicyConfig
          cutoffs={ageing.cutoffs}
          canWrite={canManage}
          rows={ageingRows}
          onRowsChange={setAgeingRows}
          pendingAction={ageingPendingAction}
          onPendingActionChange={setAgeingPendingAction}
          hoverValue={ageingHoverValue}
          onHoverValueChange={setAgeingHoverValue}
          pending={pending}
        />
      ) : null}
      {pricing ? (
        <PricingPolicyConfig
          policy={pricing.policy}
          canWrite={canManage}
          currency={currency}
          onCurrencyChange={setCurrency}
          pending={pending}
        />
      ) : null}
      {/* STATIC, NOT STICKY (owner, 2026-09-13's explicit choice) - one more
          block at the end of the page, the same way each leaf's own bar used
          to sit right under its own content. */}
      {canManage && (forecast || ageing || pricing) ? (
        <FormActions
          saveLabel={ADMIN_TEXT.save}
          discardLabel={ADMIN_TEXT.discard}
          onSave={save}
          onDiscard={discard}
          pending={pending || !anyDirty}
        />
      ) : null}
    </>
  );
}
