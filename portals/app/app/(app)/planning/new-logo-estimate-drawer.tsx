"use client";
import { useState } from "react";
import { Button, Drawer, Field, FieldLabel, InputGroup, InputGroupAddon, InputGroupInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@vxture/design-ui";
import type { PlanContent, PlanTarget } from "../../domains/planning/plan-model";
import { defaultNewLogoEstimate, estimateNewLogos, newLogoPresets, newLogoRevenue, validNewLogoEstimate, type NewLogoEstimate, type NewLogoPreset } from "../../domains/planning/new-logo-estimate";
import { updateNewLogoEstimate } from "../lib/planning-autofill";
import { useLocale, useMessages } from "../lib/i18n/provider";

export function NewLogoEstimateDrawer({ content, line, disabled, locked, edit, onClose }: Readonly<{
  content: PlanContent; line: PlanTarget; disabled: boolean; locked: readonly string[];
  edit: (content: PlanContent) => void; onClose: () => void;
}>) {
  const { NEW_LOGO_ESTIMATE_TEXT: T, PLAN_VERSION_TEXT: P, COMPANY_PLANNING_TEXT: C, PLAN_VERSION_ERROR: E } = useMessages();
  const locale = useLocale();
  const revenue = content.targets.find(t => t.scope === line.scope && t.period === line.period && t.metric === "revenue");
  const currency = revenue?.currency ?? "CNY";
  const [basis, setBasis] = useState<NewLogoEstimate>(() => line.newLogoEstimate ?? defaultNewLogoEstimate(currency) ?? { preset: "custom", currency, revenueShare: "50", firstOrderAmount: "", automatic: true });
  const [error, setError] = useState("");
  const valid = validNewLogoEstimate(basis);
  const estimated = valid ? estimateNewLogos(revenue?.target ?? null, basis) : null;
  const apply = () => {
    try { edit(updateNewLogoEstimate(content, line.key, basis, locked)); onClose(); }
    catch (reason) { const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "invalid_new_logo_estimate"; setError(E[code] ?? T.error); }
  };
  return <Drawer open onClose={onClose} width="md" title={T.settings} closeLabel={P.cancel}>
    <div className="flex flex-col gap-lg">
      <p className="text-body text-muted-foreground">{T.formula}</p>
      <Field><FieldLabel htmlFor="new-logo-industry">{T.industry}</FieldLabel>
        <Select value={basis.preset} disabled={disabled || currency !== "CNY"} onValueChange={value => {
          const preset = value as NewLogoPreset | "custom";
          setBasis(previous => ({ ...previous, preset, firstOrderAmount: preset === "custom" ? previous.firstOrderAmount : newLogoPresets[preset] }));
        }}><SelectTrigger id="new-logo-industry"><SelectValue/></SelectTrigger><SelectContent>
          {[...Object.keys(newLogoPresets), "custom"].map(preset => <SelectItem key={preset} value={preset}>{T[preset as keyof typeof newLogoPresets | "custom"]}</SelectItem>)}
        </SelectContent></Select>
        <p className="text-body-small text-muted-foreground">{currency === "CNY" ? T.reference : T.otherCurrency}</p>
      </Field>
      <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <Field><FieldLabel htmlFor="new-logo-share">{T.share}</FieldLabel><InputGroup>
          <InputGroupInput id="new-logo-share" inputMode="decimal" value={basis.revenueShare} disabled={disabled} onChange={event => setBasis(previous => ({ ...previous, revenueShare: event.target.value }))}/>
          <InputGroupAddon align="end">%</InputGroupAddon>
        </InputGroup></Field>
        <Field><FieldLabel htmlFor="new-logo-first-order">{T.firstOrder}</FieldLabel><InputGroup>
          <InputGroupInput id="new-logo-first-order" inputMode="decimal" value={basis.firstOrderAmount} disabled={disabled} onChange={event => setBasis(previous => ({ ...previous, preset: "custom", firstOrderAmount: event.target.value }))}/>
          <InputGroupAddon align="end">{basis.currency}</InputGroupAddon>
        </InputGroup></Field>
      </div>
      <div className="flex items-baseline justify-between gap-md text-body"><span className="text-muted-foreground">{T.estimate}</span><span className="font-medium tabular-nums">{estimated === null ? "\u2014" : Number(estimated).toLocaleString(locale)}<span className="ml-xs text-body-small font-normal text-muted-foreground">{C.customerUnit}</span></span></div>
      {!valid || error ? <p role="alert" className="text-body-small text-destructive">{error || T.error}</p> : null}
      <div className="flex justify-end gap-sm pb-xl"><Button size="md" variant="secondary" onClick={onClose}>{P.cancel}</Button><Button size="md" disabled={disabled || !valid || !newLogoRevenue(content, { ...line, newLogoEstimate: basis })} onClick={apply}>{T.apply}</Button></div>
    </div>
  </Drawer>;
}

export function NewLogoEstimateCaption({ line }: Readonly<{ line: PlanTarget }>) {
  const locale = useLocale();
  const { NEW_LOGO_ESTIMATE_TEXT: T, COMPANY_PLANNING_TEXT: C } = useMessages();
  const basis = line.newLogoEstimate;
  if (!basis) return <>{C.newCustomerBasis}</>;
  return <span title={`${T.formula} ${basis.automatic ? T.automatic : T.manual}`}>{basis.revenueShare}% / {Number(basis.firstOrderAmount).toLocaleString(locale, { notation: "compact", maximumFractionDigits: 2 })} {basis.currency}{T.perCustomer}{" \u00b7 "}{basis.automatic ? T.automatic : T.manual}</span>;
}
